/** UI freshness only. Actions always recheck their authority on the server. */
export function governanceRefreshInterval(background: boolean): number {
  return background ? 30000 : 8000;
}
