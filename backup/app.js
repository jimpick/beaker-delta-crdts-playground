import { useEffect, useState, useMemo, Fragment } from '/web_modules/react.js'
import ReactDOM from '/web_modules/react-dom.js'
import { html } from '/web_modules/htm/react.js'
import { encode, decode } from '/web_modules/delta-crdts-msgpack-codec.js'
import CRDTs from '/web_modules/delta-crdts.js'
import Diff from '/web_modules/text-diff.js'
import { Buffer } from '/web_modules/buffer-es6.js'

const RGA = CRDTs('rga')
const RGAType = CRDTs.type('rga')

function makeRgaReplicaFromKey (key) {
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
        setReplica(makeRgaReplicaFromKey(key))
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
          setReplica(makeRgaReplicaFromKey(key))
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

  const crdtEncoded = useMemo(() => replica && encode(replica.state()), [
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
    const draftReplica = makeRgaReplicaFromKey(key)
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

  const draftCrdtEncoded = useMemo(
    () => draftReplica && encode(draftReplica.state()),
    [draftReplica]
  )

  const draftBatchEncoded = useMemo(() => draftBatch && encode(draftBatch), [
    draftBatch
  ])

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
        Key: ${key} <br />
        Value: ${replica && JSON.stringify(crdtValue)} <br />
        Binary Size (final state): ${crdtEncoded && crdtEncoded.length} <br />
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
      ${state === 'start' &&
        html`
          <button onClick=${load}>
            Load Current State + Deltas
          </button>
        `}

      <div>
        ${state === 'initial' &&
          html`
            <button
              onClick=${() => {
                saveState(replica.state())
              }}
            >
              Save State
            </button>
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
            Binary Size (final state): ${draftCrdtEncoded &&
              draftCrdtEncoded.length} <br />
            </div>
            <button
              onClick=${() => {
                saveState(draftReplica.state())
              }}
            >
              Save New State
            </button>
            <h4>Batched Deltas</h4>
            <div>
            Deltas in batch: ${draftDeltas && draftDeltas.length} <br />
            Binary Size (batched deltas): ${draftBatchEncoded &&
              draftBatchEncoded.length} <br />
            </div>
            <button
              onClick=${() => {
                saveDeltaBatch(draftBatchEncoded, clock)
              }}
            >
              Save Delta Batch
            </button>
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
    const draftReplica = makeRgaReplicaFromKey(key)
    draftReplica.apply(replica.state())
    for (const char of md) {
      // Try insertAllAt?
      draftReplica.push(char)
    }
    setReplica(draftReplica)
    setState('initial')
    setDraft(draftReplica.value().join(''))
  }

  async function load () {
    console.log('Load')
    const draftReplica = makeRgaReplicaFromKey(key)
    const thisDrive = beaker.hyperdrive.drive()
    const replicaDirs = await thisDrive.readdir('/replicas')
    console.log('Replica dirs', replicaDirs)
    const lastClock = {}
    const deltasToApply = []
    const allKeys = new Set()
    for (const dir of replicaDirs) {
      const replicaDir = `/replicas/${dir}/deltas`
      try {
        const deltaFiles = await thisDrive.readdir(replicaDir)
        console.log('deltaFiles', dir, deltaFiles)
        const sortedFiles = deltaFiles
          .map(num => parseInt(num, 10))
          .filter(num => num > 0)
          .sort()
        console.log('sortedFiles', sortedFiles)
        for (const fileNum of sortedFiles) {
          const file = `${replicaDir}/${fileNum}`
          const { metadata } = await thisDrive.stat(file)
          const { type, ...clock } = metadata
          const binary = await thisDrive.readFile(file, {
            encoding: 'binary'
          })
          for (const key in clock) {
            clock[key] = Number(clock[key])
          }
          console.log('Type', replicaDir, file, type)
          console.log('Clock', replicaDir, file, clock)
          // console.log('Binary', replicaDir, file, binary)
          const stateOrDelta = decode(binary)
          console.log('Decoded', replicaDir, file, stateOrDelta)
          if (type === 'state') {
            draftReplica.apply(stateOrDelta)
            for (const replicaKey in clock) {
              allKeys.add(replicaKey)
              if (clock[replicaKey] > (lastClock[replicaKey] || 0)) {
                lastClock[replicaKey] = clock[replicaKey]
              }
            }
          } else {
            for (const replicaKey in clock) {
              allKeys.add(replicaKey)
            }
            deltasToApply.push({
              clock,
              delta: stateOrDelta
            })
          }
        }
      } catch (e) {
        console.warn('readdir error', replicaDir, e)
      }
    }
    const lastStateClock = { ...lastClock }
    console.log('Merged states value:', draftReplica.value().join(''))
    console.log('Unsorted deltas to apply', deltasToApply)
    console.log('All keys', allKeys)
    const sortedDeltasToApply = [...deltasToApply].sort((a, b) => {
      const clockA = { ...a.clock }
      const clockB = { ...b.clock }
      let after
      let before
      for (const key of [...allKeys]) {
        if (!clockA[key]) clockA[key] = 0
        if (!clockB[key]) clockB[key] = 0
        if (clockA[key] > clockB[key]) {
          after = true
          if (before) break
        }
        if (clockA[key] < clockB[key]) {
          before = true
          if (after) break
        }
      }
      console.log('A B after before', clockA, clockB, after, before)
      if (before && after) {
        // concurrent changes, return consistent sort order
        for (const key of [...allKeys]) {
          if (clockA[key] > clockB[key]) return 1
          if (clockA[key] < clockB[key]) return -1
        }
        return 0
      }
      if (after) return 1
      if (before) return -1
      return 0
    })
    console.log('Sorted deltas to apply', sortedDeltasToApply)
    for (const { clock, delta } of sortedDeltasToApply) {
      console.log('Applying delta', delta, clock)
      let skip
      for (const key of allKeys) {
        if (clock[key] < lastStateClock[key]) {
          skip = true
          continue
        }
      }
      if (skip) {
        console.log('Skipping')
      } else {
        draftReplica.apply(delta)
        for (const replicaKey in clock) {
          if (clock[replicaKey] > (lastClock[replicaKey] || 0)) {
            lastClock[replicaKey] = clock[replicaKey]
          }
        }
      }
    }
    console.log('Loaded value:', draftReplica.value().join(''))
    console.log('Final clock', lastClock)
    setReplica(draftReplica)
    setDraft(draftReplica.value().join(''))
    setClock(lastClock)
    setState('loaded')
  }

  async function saveState (crdtState) {
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
    // const crdtState = replica.state()
    console.log('State', crdtState)
    const bin = encode(crdtState)
    const { version } = await beaker.hyperdrive.getInfo(`hyper://${key}`)
    const clock = {
      [key]: version + 1
    }
    const outputFile = `${replicaDir}/${version + 1}`
    await thisDrive.writeFile(outputFile, bin, {
      metadata: {
        type: 'state',
        ...clock
      }
    })
    setClock(clock)
    console.log('Wrote state:', outputFile, clock)
    setState('loaded')
    // FIXME: update draft
  }

  async function saveDeltaBatch (encodedBatch, currentClock) {
    console.log('Save delta batch', replicaDir)
    const thisDrive = beaker.hyperdrive.drive()
    const url = `hyper://${key}`
    /*
    const info = await beaker.hyperdrive.getInfo(url)
    */
    // workaround for version being 'undefined'
    const replicaDrive = await beaker.hyperdrive.drive(url)
    const stat = await beaker.hyperdrive.stat('/')
    const info = await replicaDrive.getInfo()
    console.log('Info', info)
    const { version } = info
    console.log('Version', version, url.slice(4))
    if (!version) throw new Error("Couldn't determine version")
    const newClock = {
      ...currentClock,
      [key]: version + 1
    }
    const outputFile = `${replicaDir}/${version + 1}`
    await thisDrive.writeFile(outputFile, encodedBatch, {
      metadata: {
        type: 'delta',
        ...newClock
      }
    })
    console.log('Wrote delta batch:', outputFile, newClock)
    // FIXME: update draft
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
