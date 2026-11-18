#!/usr/bin/env node

const BANNER = `
  ╭──────────────────────────────────╮
  │                                  │
  │   ⚡ fluxory                     │
  │   live observability dashboard   │
  │                                  │
  ╰──────────────────────────────────╯
`

console.log(BANNER)
require('../dist/server/index.js')
