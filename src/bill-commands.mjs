/**
 * Argument handling for `opencodelaw bill …` and `opencodelaw act …`.
 * Kept apart from bill-cli.mjs so the logic stays importable by tests without
 * dragging argv parsing along.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, validateBill, report, loadBill } from './bill.mjs'
import { billNew, billSubmit, actEnact, actApply } from './bill-cli.mjs'

const flag = (args, name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (args, name) => args.includes(`--${name}`)

export async function runBillCommand (group, args) {
  const [sub, ...rest] = args
  const file = rest.find(a => !a.startsWith('--'))

  const need = () => {
    if (!file) { console.error(`opencodelaw ${group} ${sub}: give the path to a bill file.`); process.exit(2) }
    if (!fs.existsSync(file)) { console.error(`opencodelaw: no such file: ${file}`); process.exit(2) }
    return file
  }

  try {
    if (group === 'bill' && sub === 'new') {
      const r = billNew({ type: flag(rest, 'type', 'amendment'), name: flag(rest, 'name'), year: Number(flag(rest, 'year', new Date().getFullYear())) })
      console.log(`Created ${r.rel}`)
      console.log(`  drafted against constitution ${r.baseVersion}`)
      console.log('  Next: open it, describe your change, then run')
      console.log(`    npx opencodelaw bill validate ${r.rel}`)
      return
    }

    if (group === 'bill' && sub === 'validate') {
      const result = validateBill(need())
      console.log(report(result))
      process.exit(result.problems.errors.length ? 1 : 0)
    }

    if (group === 'bill' && sub === 'render') {
      const { renderBillText, renderBillHtml } = await import('./bill-render.mjs')
      const bill = loadBill(need())
      const { loadConstitution } = await import('./bill.mjs')
      const c = loadConstitution()
      // Pass info itself: houseStyle() reads info.instrument (snake_case in the
      // YAML) and maps it. Spreading the YAML keys at top level looked
      // equivalent and silently dropped the signatory office and the whole
      // address footer, because those options are camelCase.
      const opts = { info: c.info, orgYear: flag(rest, 'org-year', 'Fourth') }
      const base = file.replace(/\.ya?ml$/, '')
      fs.writeFileSync(`${base}.txt`, renderBillText(bill, opts))
      fs.writeFileSync(`${base}.html`, renderBillHtml(bill, opts))
      console.log(`Rendered:\n  ${path.relative(ROOT, `${base}.txt`)}\n  ${path.relative(ROOT, `${base}.html`)}`)
      console.log('  Open the HTML and print to PDF to produce the instrument for signature.')
      return
    }

    if (group === 'bill' && sub === 'submit') {
      const r = billSubmit(need(), { actor: flag(rest, 'actor', 'ICC') })
      console.log(`Submitted as Bill ${r.number} of ${r.year}.`)
      return
    }

    if (group === 'act' && sub === 'enact') {
      const r = actEnact(need(), {
        signedPdf: flag(rest, 'signed-pdf'), signedBy: flag(rest, 'signed-by'),
        assentDate: flag(rest, 'assent-date'), assentedBy: flag(rest, 'assented-by'),
        actor: flag(rest, 'actor', 'ICC')
      })
      console.log(`Enacted as Act ${r.actNumber} of ${r.year}.`)
      console.log(`  signed instrument sha256 ${r.sha256}`)
      return
    }

    if (group === 'act' && sub === 'apply') {
      const r = actApply(need(), { dryRun: has(rest, 'dry-run') })
      console.log(`${r.actId}${has(rest, 'dry-run') ? ' (dry run)' : ''}`)
      for (const o of r.outcomes) console.log(`  ${o.op}  ${o.target}  ${o.result}`)
      console.log(`  constitution version -> ${r.version}`)
      if (!has(rest, 'dry-run')) console.log('  Next: npm run sync-register && npm run provenance && npm run build')
      return
    }

    console.error(`opencodelaw ${group}: unknown subcommand "${sub ?? ''}"`)
    process.exit(2)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
