export function randomPort (min = 1024, max = 65535): number {
  return Math.floor(Math.random() * (max - min + 1) + min)
}
