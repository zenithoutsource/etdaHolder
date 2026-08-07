export class InvalidProofError extends Error {
  constructor(message: string, public readonly cNonce: string) {
    super(message)
    this.name = 'InvalidProofError'
  }
}
