import { useEffect, useState, useMemo, Fragment } from '/web_modules/react.js'
import ReactDOM from '/web_modules/react-dom.js'
import { html } from '/web_modules/htm/react.js'
import { encode, decode } from '/web_modules/delta-crdts-msgpack-codec.js'
import CRDTs from '/web_modules/delta-crdts.js'
import Diff from '/web_modules/text-diff.js'
import { Buffer } from '/web_modules/buffer-es6.js'

const RGA = CRDTs('rga')
const RGAType = CRDTs.type('rga')

function MakeRgaReplicaFromKey (key) {
  const shortKey = Buffer.from(key.slice(-6), 'hex')
  return RGA(shortKey)
}

function Main () {
  const [key, setKey] = useState()
  const [replica, setReplica] = useState()
  const [error, setError] = useState()
  const [originator, setOriginator] = useState()
  const [state, setState] = useState('start')
  const [draft, setDraft] = useState()
  const [replicaDir, setReplicaDir] = useState()
  const [clock, setClock] = useState()

  useEffect(() => {
    async function run () {
      const thisDrive = beaker.hyperdrive.drive()
      const info = await thisDrive.getInfo()
      let key
      if (info.writable) {
        // jpimac
        key = info.key
        setKey(key)
        setReplica(MakeRgaReplicaFromKey(key))
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
          setReplica(MakeRgaReplicaFromKey(key))
          setReplicaDir('/replicas/jpmbp2/deltas')
        } else {
          setError("Error: Couldn't identify writable local replica")
        }
      }
    }
    run()
  }, [])

  const crdtValue = useMemo(() => replica && replica.value().join(''), [
    replica
  ])

  const crdtBinSize = useMemo(() => replica && encode(replica.state()), [
    replica
  ])

  const [diff, textDiff] = useMemo(() => {
    if (!crdtValue || !draft) return [null, null]
    const diff = new Diff()
    return [diff, diff.main(crdtValue, draft)]
  }, [crdtValue, draft])

  const prettyDiff = useMemo(() => diff && diff.prettyHtml(textDiff), [
    diff,
    textDiff
  ])

  const [draftReplica, draftDeltas, draftBatch] = useMemo(() => {
    if (!replica) return [null, null, null]
    const draftReplica = MakeRgaReplicaFromKey(key)
    draftReplica.apply(replica.state())
    const deltas = []
    console.log('Jim0', replica.value().join(''), draftReplica.value().join(''))
    let cursor = 0
    if (textDiff) {
      for (const [op, segment] of textDiff) {
        if (op === 0) {
          cursor += segment.length
        } else if (op === 1) {
          for (const char of segment) {
            // Try insertAllAt?
            const delta = draftReplica.insertAt(cursor++, char)
            console.log('Jim1', draftReplica.value().join(''))
            console.log('Jim1a', replica.value().join(''))
            deltas.push(delta)
          }
        } else if (op === -1) {
          for (const char of segment) {
            const delta = draftReplica.removeAt(cursor)
            console.log('Jim2', draftReplica.value().join(''))
            deltas.push(delta)
          }
        }
      }
    }
    const batch = deltas.reduce(
      (draft, delta) => RGAType.join(draft, delta),
      RGAType.initial()
    )
    return [draftReplica, deltas, batch]
  }, [replica, textDiff])

  const draftCrdtValue = useMemo(
    () => draftReplica && draftReplica.value().join(''),
    [draftReplica]
  )

  const draftCrdtBinSize = useMemo(
    () => draftReplica && encode(draftReplica.state()),
    [draftReplica]
  )

  const draftBatchBinSize = useMemo(
    () => draftBatch && encode(draftBatch),
    [draftBatch]
  )

  return html`
    <div>
      <h1>React + Htm + Snowpack + Delta CRDTs</h1>

      <p>
        Right now, all this does is load some saved CRDT state from a file in a
        hyperarchive. Uses the ${' '}
        <a href="https://github.com/peer-base/js-delta-crdts">js-delta-crdts</a>
        ${' '} library. I temporarily removed the ormap CRDT due to issues with
        the bundler and circular dependencies. The patches and snowpack setup
        are in ${' '}
        <a href="https://github.com/jimpick/beaker-delta-crdts-playground"
          >jimpick/beaker-delta-crdts-playground</a
        >.
      </p>

      <div style=${{ marginBottom: '1rem' }}>
        State: ${state}<br />
        Originator? ${`${!!originator}`} <br />
        Value: ${replica && JSON.stringify(crdtValue)} <br />
        Binary Size (final state): ${crdtBinSize && crdtBinSize.length} <br />
        Clock:
        ${clock &&
          html`
            <div>
              ${Object.keys(clock)
                .sort()
                .map(
                  key => html`
                    <div key=${key}>${key}: ${clock[key]}</div>
                  `
                )}
            </div>
          `}
      </div>

      ${originator &&
        state === 'start' &&
        html`
          <button onClick=${createInitial}>
            Create Initial RGA Replica from index.md
          </button>
        `}

      <div>
        ${state === 'initial' &&
          html`
            <button onClick=${saveState}>Save State</button>
          `}
      </div>
      <div>
        ${state === 'loaded' &&
          html`
          <${Fragment}>
            <div>
              <textarea value=${draft} onChange=${changeDraft}
              style=${{ width: '70vw', height: '20vh' }}
              spellCheck="false" />
            </div>
            <div dangerouslySetInnerHTML=${{ __html: prettyDiff }} />
            <h4>Diff:</h4>
            <div><details><pre>${JSON.stringify(
              textDiff,
              null,
              2
            )}</pre></details></div>
            <h4>Draft</h4>
            <div>
            Value: ${draftReplica && JSON.stringify(draftCrdtValue)} <br />
            Binary Size (final state): ${draftCrdtBinSize &&
              draftCrdtBinSize.length} <br />
            </div>
            <h4>Batched Deltas</h4>
            <div>
            Deltas in batch: ${draftDeltas && draftDeltas.length} <br />
            Binary Size (batched deltas): ${draftBatchBinSize &&
              draftBatchBinSize.length} <br />
            </div>
          </${Fragment}>
        `}
      </div>
    </div>
  `

  async function createInitial () {
    console.log('Create initial')
    const md = await beaker.hyperdrive.readFile('/replicas/jpimac/test.md')
    console.log('md', md)
    if (!replica) throw new Error('no replica!')
    const draftReplica = MakeRgaReplicaFromKey(key)
    draftReplica.apply(replica.state())
    for (const char of md) {
      // Try insertAllAt?
      draftReplica.push(char)
    }
    setReplica(draftReplica)
    setState('initial')
    setDraft(draftReplica.value().join(''))
  }

  async function saveState () {
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

  function changeDraft (event) {
    setDraft(event.target.value)
  }
}

ReactDOM.render(
  html`
    <${Main} />
  `,
  document.getElementById('app')
)
