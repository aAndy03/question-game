import { describe, expect, it } from 'vitest'
import { scan } from './release-check'

describe('release check', () => {
  it('finds what a release may not ship', () => {
    const findings = scan([
      { name: 'index.html', text: '<script type="module" src="https://cdn.example.com/x.js"></script>' },
      { name: 'a.js', text: 'fetch("https://api.example.com/")' },
      { name: 'b.js', text: 'x("perf_report",{heap:1})' },
      { name: 'c.js', text: 'const m="__QG_FAKE_HOST__"' },
      { name: 'd.js', text: 'const u="http://localhost:5181/studio/"' },
    ])
    expect(findings.map((f) => `${f.file}:${f.rule}`)).toEqual([
      'index.html:external resource',
      'a.js:external fetch',
      'b.js:perf_report call',
      'c.js:fake host',
      'd.js:dev server',
    ])
  })

  it('leaves what a release legitimately contains alone', () => {
    const findings = scan([
      { name: 'a.js', text: 'e.setAttribute("xmlns","http://www.w3.org/2000/svg")' },
      { name: 'b.js', text: 'throw Error("see https://react.dev/errors/418")' },
      { name: 'c.js', text: 'const STATS=["client_log","perf_report"]' },
      { name: 'index.html', text: '<script type="module" src="/studio/assets/index.js"></script>' },
    ])
    expect(findings).toEqual([])
  })
})
