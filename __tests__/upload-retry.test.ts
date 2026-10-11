import {spawn} from 'child_process'
import {mkdir, writeFile} from 'fs/promises'
import {createServer} from 'http'
import * as path from 'path'
import {performance} from 'perf_hooks'
import {gunzipSync} from 'zlib'

const cases = [
  {name: 'success', statuses: [200], exitCode: 0},
  {name: 'recovered', statuses: [500, 200], exitCode: 0},
  {
    name: 'truncated-recovered',
    statuses: [500, 200],
    exitCode: 0,
    truncate: true
  },
  {name: 'exhausted', statuses: [500, 500, 500, 500, 500], exitCode: 1},
  {name: 'non-retryable', statuses: [404], exitCode: 1}
]

test('the built action exits after upload success or failure without a socket wait', async () => {
  const fixtureDirectory = path.join(__dirname, '_temp', 'upload-retry')
  await mkdir(fixtureDirectory, {recursive: true})
  const fixture = path.join(fixtureDirectory, 'report.txt')
  const contents = Buffer.from('artifact fixture\n')
  await writeFile(fixture, contents)

  await Promise.all(
    cases.map(async scenario => {
      let attempts = 0
      let containers = 0
      let chunks = 0
      const server = createServer((request, response) => {
        const buffers: Buffer[] = []
        request.on('data', (data: Buffer) => buffers.push(data))
        request.on('end', () => {
          const body = Buffer.concat(buffers)
          response.setHeader('Connection', 'keep-alive')
          response.setHeader('Content-Type', 'application/json')
          if (request.method === 'POST') {
            containers++
            const address = server.address()
            if (!address || typeof address === 'string') {
              throw new Error('Missing loopback listener')
            }
            expect(JSON.parse(body.toString())).toEqual({
              Type: 'actions_storage',
              Name: scenario.name
            })
            response.end(
              JSON.stringify({
                fileContainerResourceUrl: `http://127.0.0.1:${address.port}/upload`
              })
            )
          } else if (request.method === 'PUT') {
            chunks++
            const uploaded =
              request.headers['content-encoding'] === 'gzip'
                ? gunzipSync(body)
                : body
            expect(uploaded).toEqual(contents)
            response.end('{}')
          } else if (request.method === 'PATCH') {
            expect(JSON.parse(body.toString())).toEqual({Size: contents.length})
            response.statusCode = scenario.statuses[attempts++]
            if ('truncate' in scenario && scenario.truncate && attempts === 1) {
              response.setHeader('Content-Length', '1024')
              response.write('partial')
              setTimeout(() => response.destroy(), 10)
            } else {
              response.end(JSON.stringify({message: 'loopback finalisation'}))
            }
          } else {
            response.statusCode = 400
            response.end('{}')
          }
        })
      })
      server.keepAliveTimeout = 180000
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Missing loopback listener')
      }
      const started = performance.now()
      const child = spawn(process.execPath, [path.resolve('dist/index.js')], {
        env: {
          ...process.env,
          ACTIONS_RUNTIME_URL: `http://127.0.0.1:${address.port}/`,
          ACTIONS_RUNTIME_TOKEN: 'loopback-test-only',
          GITHUB_RUN_ID: '1',
          GITHUB_WORKSPACE: fixtureDirectory,
          INPUT_NAME: scenario.name,
          INPUT_PATH: fixture,
          'INPUT_INCLUDE-HIDDEN-FILES': 'false',
          'INPUT_IF-NO-FILES-FOUND': 'error'
        }
      })
      let output = ''
      let finished = 0
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString()
        if (
          output.includes(
            `Artifact ${scenario.name} has been successfully uploaded!`
          ) ||
          output.includes('::error::Finalize artifact upload failed:')
        ) {
          finished = performance.now()
        }
      })
      let errors = ''
      child.stderr.on('data', (data: Buffer) => {
        errors += data.toString()
      })
      const watchdog = setTimeout(() => child.kill(), 120000)
      try {
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          child.on('error', reject)
          child.on('exit', resolve)
        })
        const exited = performance.now()
        if (exitCode !== scenario.exitCode) {
          throw new Error(`${scenario.name}: ${output}${errors}`)
        }
        expect(errors).toBe('')
        expect(exitCode).toBe(scenario.exitCode)
        expect(containers).toBe(1)
        expect(chunks).toBe(1)
        expect(attempts).toBe(scenario.statuses.length)
        expect(finished).toBeGreaterThan(started)
        expect(exited - finished).toBeLessThan(1000)
        console.log(
          JSON.stringify({
            scenario: scenario.name,
            node: process.version,
            attempts,
            exitCode,
            elapsedMs: exited - started,
            postResultMs: exited - finished
          })
        )
      } finally {
        clearTimeout(watchdog)
        server.closeAllConnections()
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
    })
  )
}, 180000)
