type TestCase = {
  input: any[]
  output: any
}

type WorkerMessage = {
  code: string
  sampleTests: TestCase[]
  hiddenTests: TestCase[]
}

const isObject = (value: any) => value !== null && typeof value === 'object'

const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (!deepEqual(a[key], b[key])) return false
    }
    return true
  }
  return false
}

const runTests = (solution: (...args: any[]) => any, tests: TestCase[]) => {
  const failures: any[] = []
  tests.forEach((test, index) => {
    let actual
    let passed = false
    let error = ''
    try {
      actual = solution(...test.input)
      passed = deepEqual(actual, test.output)
    } catch (err: any) {
      error = err?.message || String(err)
    }
    if (!passed) {
      failures.push({
        index,
        input: test.input,
        expected: test.output,
        actual,
        error,
      })
    }
  })
  return {
    passed: tests.length - failures.length,
    total: tests.length,
    failures,
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { code, sampleTests, hiddenTests } = event.data
  try {
    const solutionFactory = new Function(`${code}\nreturn solution;`) as () => (...args: any[]) => any
    const solution = solutionFactory()
    const sampleResult = runTests(solution, sampleTests)
    const hiddenResult = runTests(solution, hiddenTests)
    self.postMessage({
      ok: true,
      sampleResult,
      hiddenResult,
    })
  } catch (err: any) {
    self.postMessage({
      ok: false,
      error: err?.message || String(err),
    })
  }
}
