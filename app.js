import ReactDOM from '/web_modules/react-dom.js'
import { html } from '/web_modules/htm/react.js'

function Main (props) {
  return html`
    <h1>React + HTM + Snowpack</h1>
  `
}

ReactDOM.render(
  html`
    <${Main} />
  `,
  document.getElementById('app')
)
