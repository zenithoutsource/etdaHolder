declare module 'react-native-qrcode-svg' {
  import type { ComponentType } from 'react'

  type QRCodeProps = {
    value: string
    size?: number
  }

  const QRCode: ComponentType<QRCodeProps>
  export default QRCode
}
