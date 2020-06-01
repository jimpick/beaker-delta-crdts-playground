import { useEffect, useState, Fragment } from '/web_modules/react.js'
import ReactDOM from '/web_modules/react-dom.js'
import { html } from '/web_modules/htm/react.js'
import { encode, decode } from '/web_modules/delta-crdts-msgpack-codec.js'
import CRDTs from '/web_modules/delta-crdts.js'
import Diff from '/web_modules/text-diff.js'

const RGA = CRDTs('rga')

function Main(props) {
  const [key, setKey] = useState()
  const [replica, setReplica] = useState()
  const [error, setError] = useState()
  const [originator, setOriginator] = useState()
  const [state, setState] = useState('start')
  const [draft, setDraft] = useState()
  const [prettyDiff, setPrettyDiff] = useState()
  const [replicaDir, setReplicaDir] = useState()
  const [clock, setClock] = useState()

  useEffect(() => {
    async function run() {
      const thisDrive = beaker.hyperdrive.drive()
      const info = await thisDrive.getInfo()
      let key
      if (info.writable) {
        // jpimac
        key = info.key
        setKey(key)
        setReplica(RGA(key))
        setOriginator(true)
        setReplicaDir('/replicas/jpimac/deltas')
      } else {
        // jpmbp2
        const files = await thisDrive.readdir('/replicas/jpmbp2')
        console.log('Jim files', files)
        const stat1 = await thisDrive.stat('/replicas/jpmbp2/index.md')
        console.log('Jim stat jpmbp2/index.md', stat1)
        const stat2 = await thisDrive.stat('/replicas/jpmbp2')
        console.log('Jim stat jpmbp2', stat2)
        key = stat2.mount.key
        const info = await beaker.hyperdrive.getInfo(`hyper://${key}`)
        console.log('Jim info', info)
        if (info.writable) {
          setKey(key)
          setReplica(RGA(key))
          setReplicaDir('/replicas/jpmbp2/deltas')
        } else {
          setError("Error: Couldn't identify writable local replica")
        }
      }
    }
    run()
  }, [])

  useEffect(() => {
    async function run() {
      // const replicas = await beaker.hyperdrive.readdir('/replicas')
      // const files = await beaker.hyperdrive.readdir('/replicas/jpmbp2')
      /*
      const binary = await beaker.hyperdrive.readFile('/replicas/jpmbp2/state1', {
        encoding: 'binary'
      })
      const state1 = codec.decode(binary)
      const replica = RGA('replica2')
      replica.apply(state1)
      setValue(replica.value())
      */
    }
    run()
  }, [])

  return html`
    <div>
      <h1>React + Htm + Snowpack + Delta CRDTs</h1>

      <p>
      Right now, all this does is load some saved CRDT state from a
      file in a hyperarchive. Uses the <a href="https://github.com/peer-base/js-delta-crdts">js-delta-crdts</a> library. I temporarily removed the ormap CRDT due to issues with the bundler and circular dependencies. The patches and snowpack setup are in <a href="https://github.com/jimpick/beaker-delta-crdts-playground">jimpick/beaker-delta-crdts-playground</a>.
      </p>

      <div style=${{ marginBottom: '1rem' }}>
      State: ${state}<br />
      Originator? ${`${!!originator}`} <br />
      Value: ${replica && JSON.stringify(replica.value())}
      </div>

      ${originator && state === 'start' && html`<button onClick=${createInitial}>Create Initial RGA Replica from index.md</button>`}

      <div>
        ${state === 'initial' && html`
          <button onClick=${saveState}>Save State</button>
        `}
      </div>
      <div>
        ${state === 'loaded' && html`
          <${Fragment}>
            <div>
              <textarea value=${draft} onChange=${changeDraft}
              style=${{ width: '70vw', height: '20vh' }}
              spellCheck="false" />
            </div>
            <button onClick=${computeDiff}>Compute Diff</button>
          ${prettyDiff}
          </${Fragment}>
        `}
      </div>
    </div>
  `

  async function createInitial() {
    console.log('Create initial')
    const md = await beaker.hyperdrive.readFile('/replicas/jpimac/test.md')
    console.log('md', md)
    if (!replica) throw new Error('no replica!')
    for (const char of md) {
      replica.push(char)
      setReplica({ ...replica })
    }
    setState('initial')
    setDraft(replica.value().join(''))
  }

  async function saveState() {
    console.log('Save state', replicaDir)
    const thisDrive = beaker.hyperdrive.drive()
    try {
      await thisDrive.rmdir(replicaDir, { recursive: true })
    } catch (e) {
      if (e.message !== 'Uncaught NotFoundError: File not found') {
        throw e
      }
    }
    await thisDrive.mkdir(replicaDir)
    const crdtState = replica.state()
    console.log('State', crdtState)
    const bin = encode(crdtState)
    const { version } = await beaker.hyperdrive.getInfo(`hyper://${key}`)
    const clock = {
      [key]: version + 1
    }
    const outputFile = `${replicaDir}/${version + 1}`
    await thisDrive.writeFile(outputFile, bin, { metadata: clock })
    setClock(clock)
    console.log('Wrote state:', outputFile, clock)
    setState('loaded')
  }

  function changeDraft(event) {
    setDraft(event.target.value)
  }

  function computeDiff() {
    const diff = new Diff()
    const oldValue = replica.value().join('')
    const newValue = draft
    const textDiff = diff.main(oldValue, newValue)
    console.log('textDiff', textDiff)
    setPrettyDiff(diff.prettyHtml(textDiff))
  }
}

ReactDOM.render(
  html`
    <${Main} />
  `,
  document.getElementById('app')
)

