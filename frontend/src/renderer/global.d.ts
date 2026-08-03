// Allow importing JSON modules
declare module '*.json' {
  const value: Record<string, string>
  export default value
}
