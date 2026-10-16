// Private observability via New Relic Browser. Numbers only: never question text or page content.
// Off until you paste your New Relic Browser snippet into index.html (it defines window.newrelic).
export function track(name, attrs) {
  try { window.newrelic?.addPageAction(name, attrs); } catch {}
}
