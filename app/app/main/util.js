const rp = require('request-promise')

function waitUntilServerResponds (createWindow, windowUrl) {
  rp(windowUrl)
    .then((html) => {
      return createWindow()
    })
    .catch((err) => {
      console.log(err)
      setTimeout(() => {
        waitUntilServerResponds(createWindow, windowUrl)
      }, 500)
    })
}

module.exports = {waitUntilServerResponds}
