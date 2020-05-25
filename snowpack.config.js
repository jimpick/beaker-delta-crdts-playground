module.exports = {
  webDependencies: [
    "htm",
    "htm/react",
    "react",
    "react-dom",
    "@jimpick/delta-crdts",
    "@jimpick/delta-crdts-msgpack-codec",
    "msgpack5"
  ],
  rollup: {
    external: ['readable-stream'],
    plugins: [
      require('rollup-plugin-node-polyfills')()
    ]
  }
}

