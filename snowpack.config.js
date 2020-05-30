module.exports = {
  webDependencies: [
    "htm",
    "htm/react",
    "react",
    "react-dom",
    "@jimpick/delta-crdts",
    "@jimpick/delta-crdts-msgpack-codec"
  ],
  rollup: {
    plugins: [
      require('@rollup/plugin-replace')({
        values: {
          'readable-stream/transform': '_stream_transform',
          'readable-stream/duplex': '_stream_duplex'
        }
      }),
      require('rollup-plugin-node-polyfills')()
    ]
  }
}

