import fs from 'node:fs'
import path from 'node:path'

describe('test mDL inject removed', () => {
  test('Home does not import InjectTestMdlButton', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../app/(tabs)/index.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/InjectTestMdlButton/)
  })

  test('inject service file is gone', () => {
    expect(
      fs.existsSync(path.join(__dirname, 'injectTestMdl.ts')),
    ).toBe(false)
  })
})
