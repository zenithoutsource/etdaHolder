export function areDevelopmentApisEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production'
}
