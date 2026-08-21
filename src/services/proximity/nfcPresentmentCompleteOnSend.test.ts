import fs from 'node:fs'
import path from 'node:path'

const sessionPath = path.join(
  __dirname,
  '../../../modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazPresentmentSession.kt',
)
const enginePath = path.join(
  __dirname,
  '../../../modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/StoredMdocPresentationEngine.kt',
)

function kotlinFun(source: string, name: string): string {
  const start = source.indexOf(`fun ${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\n  fun ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

describe('NFC presentment completes when DeviceResponse send starts', () => {
  test('onSendingResponse notifies JS without tearing down HCE', () => {
    const session = fs.readFileSync(sessionPath, 'utf8')
    const sending = session.match(/onSendingResponse = \{([\s\S]*?)\n\s*\},/)
    expect(sending?.[1]).toMatch(/notifyPresentationComplete/)
    expect(sending?.[1]).not.toMatch(/finishSessionAfterPresentment/)
    expect(sending?.[1]).not.toMatch(/completePresentation/)
    expect(sending?.[1]).not.toMatch(/onPresentationSessionEnded/)
  })

  test('notifyPresentationComplete does not stop the APDU path', () => {
    const engine = fs.readFileSync(enginePath, 'utf8')
    const body = kotlinFun(engine, 'notifyPresentationComplete')
    expect(body).toMatch(/sendPresentationComplete/)
    expect(body).not.toMatch(/onPresentationSessionEnded/)
    expect(body).not.toMatch(/MdocApduHandler/)
  })
})
