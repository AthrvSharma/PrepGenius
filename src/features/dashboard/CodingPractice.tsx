import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import { Input } from '../../components/ui/input'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import { clampText } from '../../lib/validation'
import {
  CheckCircle2,
  Code,
  Filter,
  Loader2,
  Play,
  Search,
  Terminal,
  XCircle,
  ArrowLeft,
  Sparkles,
  Copy,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface CodingChallenge {
  id: string
  title: string
  difficulty: string
  tags: string[]
  prompt: string
  constraints: string[]
  functionName: string
  starterCode: {
    prefix: string
    body: string
    suffix: string
  }
  sampleTests: Array<{ input: any[]; output: any }>
  hiddenTests: Array<{ input: any[]; output: any }>
  timeLimitMs: number
  category?: string
  acceptance?: number
  examples?: Array<{ input: string; output: string; explanation?: string }>
}

const difficultyOrder: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

const languageFileName: Record<string, string> = {
  javascript: 'solution.js',
  python: 'solution.py',
  java: 'Solution.java',
  cpp: 'solution.cpp',
}

const formatTimeLimit = (timeLimitMs?: number) => {
  if (!timeLimitMs) return '--'
  const seconds = timeLimitMs / 1000
  return `${seconds.toFixed(1)}s`
}

const API_BASE = (
  import.meta.env.VITE_AI_BASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/$/, '')
const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
]

const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false
      return a.every((item, index) => deepEqual(item, b[index]))
    }
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) => deepEqual(a[key], b[key]))
  }
  return false
}

const buildTemplate = (lang: string) => {
  if (lang === 'python') {
    return `import sys
import json

input_data = sys.stdin.read().strip()
tests = json.loads(input_data) if input_data else []

def solution(*args):
__USER_CODE__

outputs = [solution(*t["input"]) for t in tests]
sys.stdout.write(json.dumps(outputs))
`
  }
  if (lang === 'java') {
    return `import java.io.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    String input = new String(System.in.readAllBytes());
    Object parsed = Json.parse(input.trim().isEmpty() ? "[]" : input);
    List<?> tests = (List<?>) parsed;
    Solution solver = new Solution();
    List<Object> outputs = new ArrayList<>();
    for (Object test : tests) {
      Map<?, ?> t = (Map<?, ?>) test;
      List<?> inputList = (List<?>) t.get("input");
      Object[] callArgs = convertArgs(inputList);
      Object result = solver.solution(callArgs);
      outputs.add(result);
    }
    System.out.print(Json.stringify(outputs));
  }

  static Object[] convertArgs(List<?> inputList) {
    Object[] args = new Object[inputList.size()];
    for (int i = 0; i < inputList.size(); i++) {
      args[i] = convert(inputList.get(i));
    }
    return args;
  }

  static Object convert(Object value) {
    if (value instanceof Number) {
      return ((Number) value).intValue();
    }
    if (value instanceof String || value instanceof Boolean) {
      return value;
    }
    if (value instanceof List) {
      List<?> list = (List<?>) value;
      if (list.isEmpty()) return list;

      boolean allNumbers = true;
      boolean allStrings = true;
      boolean allBooleans = true;
      for (Object item : list) {
        if (!(item instanceof Number)) allNumbers = false;
        if (!(item instanceof String)) allStrings = false;
        if (!(item instanceof Boolean)) allBooleans = false;
      }
      if (allNumbers) {
        int[] arr = new int[list.size()];
        for (int i = 0; i < list.size(); i++) {
          arr[i] = ((Number) list.get(i)).intValue();
        }
        return arr;
      }
      if (allStrings) {
        String[] arr = new String[list.size()];
        for (int i = 0; i < list.size(); i++) {
          arr[i] = String.valueOf(list.get(i));
        }
        return arr;
      }
      if (allBooleans) {
        boolean[] arr = new boolean[list.size()];
        for (int i = 0; i < list.size(); i++) {
          arr[i] = (Boolean) list.get(i);
        }
        return arr;
      }

      boolean allListNumbers = true;
      boolean allListStrings = true;
      boolean allListBooleans = true;
      for (Object item : list) {
        if (!(item instanceof List)) {
          allListNumbers = false;
          allListStrings = false;
          allListBooleans = false;
          break;
        }
        List<?> inner = (List<?>) item;
        for (Object innerItem : inner) {
          if (!(innerItem instanceof Number)) allListNumbers = false;
          if (!(innerItem instanceof String)) allListStrings = false;
          if (!(innerItem instanceof Boolean)) allListBooleans = false;
        }
      }
      if (allListNumbers) {
        int[][] arr = new int[list.size()][];
        for (int i = 0; i < list.size(); i++) {
          List<?> inner = (List<?>) list.get(i);
          int[] row = new int[inner.size()];
          for (int j = 0; j < inner.size(); j++) {
            row[j] = ((Number) inner.get(j)).intValue();
          }
          arr[i] = row;
        }
        return arr;
      }
      if (allListStrings) {
        String[][] arr = new String[list.size()][];
        for (int i = 0; i < list.size(); i++) {
          List<?> inner = (List<?>) list.get(i);
          String[] row = new String[inner.size()];
          for (int j = 0; j < inner.size(); j++) {
            row[j] = String.valueOf(inner.get(j));
          }
          arr[i] = row;
        }
        return arr;
      }
      if (allListBooleans) {
        boolean[][] arr = new boolean[list.size()][];
        for (int i = 0; i < list.size(); i++) {
          List<?> inner = (List<?>) list.get(i);
          boolean[] row = new boolean[inner.size()];
          for (int j = 0; j < inner.size(); j++) {
            row[j] = (Boolean) inner.get(j);
          }
          arr[i] = row;
        }
        return arr;
      }

      return list;
    }
    return value;
  }

  static class Solution {
    public Object solution(Object... args) {
__USER_CODE__
    }
  }

  static class Json {
    private static int index;
    private static String src;

    static Object parse(String s) {
      src = s;
      index = 0;
      skip();
      return parseValue();
    }

    static String stringify(Object value) {
      if (value == null) return "null";
      if (value instanceof String) return "\\\"" + escape((String) value) + "\\\"";
      if (value instanceof Number || value instanceof Boolean) return value.toString();
      if (value instanceof Map) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        boolean first = true;
        for (Object entryObj : ((Map<?, ?>) value).entrySet()) {
          Map.Entry<?, ?> entry = (Map.Entry<?, ?>) entryObj;
          if (!first) sb.append(",");
          first = false;
          sb.append("\\\"").append(escape(String.valueOf(entry.getKey()))).append("\\\":");
          sb.append(stringify(entry.getValue()));
        }
        sb.append("}");
        return sb.toString();
      }
      if (value instanceof List) {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        boolean first = true;
        for (Object item : (List<?>) value) {
          if (!first) sb.append(",");
          first = false;
          sb.append(stringify(item));
        }
        sb.append("]");
        return sb.toString();
      }
      if (value.getClass().isArray()) {
        if (value instanceof int[]) {
          int[] arr = (int[]) value;
          List<Object> list = new ArrayList<>();
          for (int v : arr) list.add(v);
          return stringify(list);
        }
        if (value instanceof long[]) {
          long[] arr = (long[]) value;
          List<Object> list = new ArrayList<>();
          for (long v : arr) list.add(v);
          return stringify(list);
        }
        if (value instanceof double[]) {
          double[] arr = (double[]) value;
          List<Object> list = new ArrayList<>();
          for (double v : arr) list.add(v);
          return stringify(list);
        }
        if (value instanceof boolean[]) {
          boolean[] arr = (boolean[]) value;
          List<Object> list = new ArrayList<>();
          for (boolean v : arr) list.add(v);
          return stringify(list);
        }
        Object[] arr = (Object[]) value;
        return stringify(Arrays.asList(arr));
      }
      return "\\\"" + escape(value.toString()) + "\\\"";
    }

    private static Object parseValue() {
      skip();
      if (index >= src.length()) return null;
      char c = src.charAt(index);
      if (c == '"') return parseString();
      if (c == '-' || Character.isDigit(c)) return parseNumber();
      if (c == 't') { index += 4; return true; }
      if (c == 'f') { index += 5; return false; }
      if (c == 'n') { index += 4; return null; }
      if (c == '[') return parseArray();
      if (c == '{') return parseObject();
      return null;
    }

    private static List<Object> parseArray() {
      index++;
      List<Object> list = new ArrayList<>();
      skip();
      if (src.charAt(index) == ']') { index++; return list; }
      while (index < src.length()) {
        list.add(parseValue());
        skip();
        char c = src.charAt(index);
        if (c == ',') { index++; continue; }
        if (c == ']') { index++; break; }
      }
      return list;
    }

    private static Map<String, Object> parseObject() {
      index++;
      Map<String, Object> map = new LinkedHashMap<>();
      skip();
      if (src.charAt(index) == '}') { index++; return map; }
      while (index < src.length()) {
        String key = parseString();
        skip();
        if (src.charAt(index) == ':') index++;
        Object value = parseValue();
        map.put(key, value);
        skip();
        char c = src.charAt(index);
        if (c == ',') { index++; continue; }
        if (c == '}') { index++; break; }
      }
      return map;
    }

    private static String parseString() {
      index++;
      StringBuilder sb = new StringBuilder();
      while (index < src.length()) {
        char c = src.charAt(index++);
        if (c == '"') break;
        if (c == '\\\\') {
          char n = src.charAt(index++);
          if (n == '"' || n == '\\\\' || n == '/') sb.append(n);
          else if (n == 'b') sb.append('\\b');
          else if (n == 'f') sb.append('\\f');
          else if (n == 'n') sb.append('\\n');
          else if (n == 'r') sb.append('\\r');
          else if (n == 't') sb.append('\\t');
          else sb.append(n);
        } else {
          sb.append(c);
        }
      }
      return sb.toString();
    }

    private static Number parseNumber() {
      int start = index;
      if (src.charAt(index) == '-') index++;
      while (index < src.length() && Character.isDigit(src.charAt(index))) index++;
      if (index < src.length() && src.charAt(index) == '.') {
        index++;
        while (index < src.length() && Character.isDigit(src.charAt(index))) index++;
      }
      String num = src.substring(start, index);
      if (num.contains(".")) return Double.parseDouble(num);
      return Long.parseLong(num);
    }

    private static void skip() {
      while (index < src.length() && Character.isWhitespace(src.charAt(index))) index++;
    }

    private static String escape(String s) {
      return s.replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"");
    }
  }
}
`
  }
  if (lang === 'cpp') {
    return `#include <bits/stdc++.h>
using namespace std;

struct Json {
  enum Type { Null, Bool, Number, String, Array, Object } type;
  bool b{}; double num{}; string str; vector<Json> arr; map<string, Json> obj;
};

struct Parser {
  string s; size_t i = 0;
  Parser(string input) : s(std::move(input)) {}
  void skip() { while (i < s.size() && isspace(s[i])) i++; }
  Json parse() { skip(); return parseValue(); }
  Json parseValue() {
    skip();
    if (i >= s.size()) return {Json::Null};
    char c = s[i];
    if (c == 'n') { i += 4; return {Json::Null}; }
    if (c == 't') { i += 4; Json j{Json::Bool}; j.b = true; return j; }
    if (c == 'f') { i += 5; Json j{Json::Bool}; j.b = false; return j; }
    if (c == '"') return parseString();
    if (c == '[') return parseArray();
    if (c == '{') return parseObject();
    return parseNumber();
  }
  Json parseString() {
    i++;
    Json j{Json::String};
    while (i < s.size()) {
      char c = s[i++];
      if (c == '"') break;
      if (c == '\\' && i < s.size()) {
        char n = s[i++];
        if (n == '"' || n == '\\' || n == '/') j.str.push_back(n);
        else if (n == 'b') j.str.push_back('\b');
        else if (n == 'f') j.str.push_back('\f');
        else if (n == 'n') j.str.push_back('\n');
        else if (n == 'r') j.str.push_back('\r');
        else if (n == 't') j.str.push_back('\t');
        else j.str.push_back(n);
      } else {
        j.str.push_back(c);
      }
    }
    return j;
  }
  Json parseNumber() {
    size_t start = i;
    if (s[i] == '-') i++;
    while (i < s.size() && isdigit(s[i])) i++;
    if (i < s.size() && s[i] == '.') { i++; while (i < s.size() && isdigit(s[i])) i++; }
    Json j{Json::Number};
    j.num = stod(s.substr(start, i - start));
    return j;
  }
  Json parseArray() {
    i++;
    Json j{Json::Array};
    skip();
    if (i < s.size() && s[i] == ']') { i++; return j; }
    while (i < s.size()) {
      j.arr.push_back(parseValue());
      skip();
      if (s[i] == ',') { i++; continue; }
      if (s[i] == ']') { i++; break; }
    }
    return j;
  }
  Json parseObject() {
    i++;
    Json j{Json::Object};
    skip();
    if (i < s.size() && s[i] == '}') { i++; return j; }
    while (i < s.size()) {
      Json key = parseString();
      skip();
      if (s[i] == ':') i++;
      Json value = parseValue();
      j.obj[key.str] = value;
      skip();
      if (s[i] == ',') { i++; continue; }
      if (s[i] == '}') { i++; break; }
    }
    return j;
  }
};

string stringify(const Json &j) {
  switch (j.type) {
    case Json::Null: return "null";
    case Json::Bool: return j.b ? "true" : "false";
    case Json::Number: {
      stringstream ss; ss << setprecision(15) << j.num; return ss.str();
    }
    case Json::String: {
      string out = "\"";
      for (char c : j.str) {
        if (c == '"' || c == '\\') { out += '\\'; out += c; }
        else out += c;
      }
      out += "\""; return out;
    }
    case Json::Array: {
      string out = "[";
      for (size_t i = 0; i < j.arr.size(); ++i) {
        if (i) out += ",";
        out += stringify(j.arr[i]);
      }
      out += "]"; return out;
    }
    case Json::Object: {
      string out = "{";
      size_t count = 0;
      for (const auto &kv : j.obj) {
        if (count++) out += ",";
        Json key{Json::String}; key.str = kv.first;
        out += stringify(key);
        out += ":";
        out += stringify(kv.second);
      }
      out += "}"; return out;
    }
  }
  return "null";
}

Json solution(const vector<Json> &args) {
__USER_CODE__
}

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
  if (input.empty()) input = "[]";
  Parser parser(input);
  Json root = parser.parse();
  vector<Json> outputs;
  for (const auto &test : root.arr) {
    auto it = test.obj.find("input");
    vector<Json> args;
    if (it != test.obj.end()) args = it->second.arr;
    outputs.push_back(solution(args));
  }
  Json out; out.type = Json::Array; out.arr = outputs;
  cout << stringify(out);
  return 0;
}
`
  }
  return `const fs = require('fs')
const input = fs.readFileSync(0, 'utf8').trim()
const tests = input ? JSON.parse(input) : []

function solution(...args) {
__USER_CODE__
}

const outputs = tests.map((t) => solution(...t.input))
process.stdout.write(JSON.stringify(outputs))
`
}

const inferParamMeta = (challenge: CodingChallenge | null) => {
  const sample = challenge?.sampleTests?.[0]?.input || []
  const prompt = (challenge?.prompt || '').toLowerCase()
  const namesFromPrompt: string[] = []
  const knownNames = [
    'nums', 'num', 'array', 'arr', 'target', 'k', 'n', 'm',
    's', 't', 'str', 'strs', 'string', 'strings',
    'grid', 'matrix', 'intervals', 'coins', 'amount', 'prices',
  ]
  knownNames.forEach((name) => {
    const regex = new RegExp(`\\b${name}\\b`)
    if (regex.test(prompt) && !namesFromPrompt.includes(name)) {
      namesFromPrompt.push(name)
    }
  })

  const typeOfValue = (value: any) => {
    if (Array.isArray(value)) {
      if (value.length && Array.isArray(value[0])) {
        const inner = value[0][0]
        if (typeof inner === 'string') return { java: 'String[][]', js: 'any[][]', py: 'list[list[str]]' }
        if (typeof inner === 'boolean') return { java: 'boolean[][]', js: 'any[][]', py: 'list[list[bool]]' }
        return { java: 'int[][]', js: 'any[][]', py: 'list[list[int]]' }
      }
      const first = value[0]
      if (typeof first === 'string') return { java: 'String[]', js: 'any[]', py: 'list[str]' }
      if (typeof first === 'boolean') return { java: 'boolean[]', js: 'any[]', py: 'list[bool]' }
      return { java: 'int[]', js: 'any[]', py: 'list[int]' }
    }
    if (typeof value === 'string') return { java: 'String', js: 'string', py: 'str' }
    if (typeof value === 'boolean') return { java: 'boolean', js: 'boolean', py: 'bool' }
    if (typeof value === 'number') return { java: 'int', js: 'number', py: 'int' }
    return { java: 'Object', js: 'any', py: 'any' }
  }

  return sample.map((value: any, index: number) => {
    const types = typeOfValue(value)
    const name = namesFromPrompt[index] || `arg${index + 1}`
    return { name, types }
  })
}

const scaffoldFor = (lang: string, challenge: CodingChallenge | null) => {
  const params = inferParamMeta(challenge)
  const javaVars = params.map((item, index) => {
    const type = item.types.java
    const name = item.name
    if (type.endsWith('[]')) {
      return `    ${type} ${name} = (${type}) args[${index}];`
    }
    if (type.endsWith('[][]')) {
      return `    ${type} ${name} = (${type}) args[${index}];`
    }
    return `    ${type} ${name} = (${type}) args[${index}];`
  })
  const jsVars = params.map((item, index) => `  const ${item.name} = args[${index}];`)
  const pyVars = params.map((item, index) => `    ${item.name} = args[${index}]`)

  if (lang === 'python') {
    return {
      prefix: 'def solution(*args):',
      suffix: '',
      starter: `${pyVars.join('\n')}\n    # TODO: implement solution\n    return None`.trim(),
    }
  }
  if (lang === 'java') {
    return {
      prefix: 'class Solution {\n  public Object solution(Object... args) {',
      suffix: '  }\n}',
      starter: `${javaVars.join('\n')}\n    // TODO: implement solution\n    return null;`.trim(),
    }
  }
  if (lang === 'cpp') {
    return {
      prefix: 'Json solution(const vector<Json> &args) {',
      suffix: '}',
      starter: `  // args[0], args[1] ... are Json values\n  // TODO: implement solution\n  return Json{Json::Null};`,
    }
  }
  return {
    prefix: 'function solution(...args) {',
    suffix: '}',
    starter: `${jsVars.join('\n')}\n  // TODO: implement solution\n  return null`.trim(),
  }
}

const indentBody = (body: string, spaces: number) => {
  const pad = ' '.repeat(spaces)
  return body
    .split('\n')
    .map((line) => {
      const stripped = line.replace(/^\s+/, '')
      return stripped.trim().length ? pad + stripped : ''
    })
    .join('\n')
}

const composeCode = (lang: string, body: string, challenge: CodingChallenge | null) => {
  const template = buildTemplate(lang)
  let normalizedBody = body.trim()
  if (!normalizedBody) {
    normalizedBody = scaffoldFor(lang, challenge).starter
  }
  const indentSize = lang === 'python' ? 4 : lang === 'java' ? 4 : 2
  const indented = indentBody(normalizedBody, indentSize)
  return template.replace('__USER_CODE__', indented)
}

export function CodingPractice() {
  const { profile } = useProfile()
  const [challenges, setChallenges] = useState<CodingChallenge[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState('All')
  const [category, setCategory] = useState('All Topics')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('title')
  const [language, setLanguage] = useState('javascript')
  const [codeBody, setCodeBody] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [lastSubmission, setLastSubmission] = useState<any | null>(null)
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'description' | 'editorial' | 'solutions' | 'submissions'>('description')
  const [activeCase, setActiveCase] = useState(0)

  useEffect(() => {
    const fetchChallenges = async () => {
      const data = await blink.db.codingChallenges.list()
      setChallenges(data as CodingChallenge[])
    }
    fetchChallenges()
  }, [])

  useEffect(() => {
    const fetchSolved = async () => {
      if (!profile?.userId) return
      const submissions = await blink.db.codingSubmissions.list({ where: { userId: profile.userId } })
      const passed = submissions.filter((item: any) => item.passed).map((item: any) => item.challengeId)
      setSolvedIds(new Set(passed))
    }
    fetchSolved()
  }, [profile?.userId])

  const categoryOptions = useMemo(() => {
    const values = new Set<string>()
    challenges.forEach((item) => values.add(item.category || 'Algorithms'))
    return ['All Topics', ...Array.from(values)]
  }, [challenges])

  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {}
    challenges.forEach((item) => {
      item.tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1
      })
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
  }, [challenges])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return challenges
      .filter((item) => {
        if (difficulty !== 'All' && item.difficulty.toLowerCase() !== difficulty.toLowerCase()) return false
        if (category !== 'All Topics' && (item.category || 'Algorithms') !== category) return false
        if (selectedTags.length && !selectedTags.some((tag) => item.tags.includes(tag))) return false
        if (query && !`${item.title} ${item.prompt}`.toLowerCase().includes(query)) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'difficulty') {
          return (difficultyOrder[a.difficulty.toLowerCase()] || 0) - (difficultyOrder[b.difficulty.toLowerCase()] || 0)
        }
        if (sortBy === 'acceptance') {
          return (b.acceptance || 0) - (a.acceptance || 0)
        }
        return a.title.localeCompare(b.title)
      })
  }, [challenges, difficulty, category, selectedTags, search, sortBy])

  const selected = challenges.find((item) => item.id === selectedId) || null

  const examplesToShow = useMemo<Array<{ input: string; output: string; explanation?: string }>>(() => {
    if (!selected) return []
    if (selected.examples?.length) return selected.examples
    return selected.sampleTests.map((item) => ({
      input: JSON.stringify(item.input),
      output: JSON.stringify(item.output),
      explanation: undefined,
    }))
  }, [selected])

  useEffect(() => {
    if (!selected) return
    const stored = drafts[selected.id]?.[language]
    if (stored) {
      setCodeBody(stored)
      setResult(null)
      setActiveCase(0)
      setActiveTab('description')
      return
    }
    if (selected?.starterCode?.body) {
      const scaffold = scaffoldFor(language, selected)
      setCodeBody(scaffold.starter)
      setDrafts((prev) => ({
        ...prev,
        [selected.id]: { ...(prev[selected.id] || {}), [language]: scaffold.starter },
      }))
      setResult(null)
      setActiveCase(0)
      setActiveTab('description')
    }
  }, [selected?.id, language])

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, codeBody.split('\n').length)
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [codeBody])

  const codePreview = useMemo(() => {
    if (!selected) return ''
    return composeCode(language, codeBody, selected)
  }, [selected, codeBody, language])

  const editorStats = useMemo(() => {
    const lines = Math.max(1, codeBody.split('\n').length)
    const characters = codeBody.length
    const nonEmpty = codeBody.split('\n').filter((line) => line.trim()).length
    return { lines, characters, nonEmpty }
  }, [codeBody])

  const fileLabel = useMemo(() => {
    return languageFileName[language] || 'solution.txt'
  }, [language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeBody || '')
      toast.success('Code copied to clipboard')
    } catch (error) {
      toast.error('Unable to copy code')
    }
  }

  const runCode = async () => {
    if (!selected || !profile?.userId) return
    if (!API_BASE) {
      toast.error('Code runner server is not configured.')
      return
    }
    const body = codeBody.trim()
    const lowerBody = body.toLowerCase()
    if (language === 'java' && (lowerBody.includes('class ') || lowerBody.includes('public class') || lowerBody.includes('public static void main'))) {
      toast.error('For Java, only write the method body (no class or main).')
      return
    }
    if (language === 'python' && lowerBody.includes('def solution(')) {
      toast.error('For Python, only write the function body (no def solution).')
      return
    }
    if (language === 'javascript' && lowerBody.includes('function solution(')) {
      toast.error('For JavaScript, only write the function body (no function solution).')
      return
    }
    if (language === 'cpp' && (lowerBody.includes('json solution(') || lowerBody.includes('int main('))) {
      toast.error('For C++, only write the function body (no solution signature or main).')
      return
    }
    setIsRunning(true)
    setResult(null)

    try {
      const tests = [...selected.sampleTests, ...selected.hiddenTests].map((test) => ({ input: test.input }))
      const response = await fetch(`${API_BASE}/api/code/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          code: codePreview,
          tests,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Code execution failed')
      }

      const outputs = Array.isArray(data?.outputs) ? data.outputs : []
      const sampleFailures: any[] = []
      const hiddenFailures: any[] = []

      selected.sampleTests.forEach((test, index) => {
        const actual = outputs[index]
        if (!deepEqual(actual, test.output)) {
          sampleFailures.push({ input: test.input, expected: test.output, actual })
        }
      })

      selected.hiddenTests.forEach((test, index) => {
        const outputIndex = index + selected.sampleTests.length
        const actual = outputs[outputIndex]
        if (!deepEqual(actual, test.output)) {
          hiddenFailures.push({ input: test.input, expected: test.output, actual })
        }
      })

      const summary = {
        sampleResult: {
          total: selected.sampleTests.length,
          passed: selected.sampleTests.length - sampleFailures.length,
          failures: sampleFailures,
        },
        hiddenResult: {
          total: selected.hiddenTests.length,
          passed: selected.hiddenTests.length - hiddenFailures.length,
          failures: hiddenFailures,
        },
      }

      setResult(summary)
      const passed = summary.hiddenResult.failures.length === 0

      const submission = await blink.db.codingSubmissions.create({
        id: `code_${Date.now()}`,
        userId: profile.userId,
        challengeId: selected.id,
        title: selected.title,
        difficulty: selected.difficulty,
        passed,
        samplePassed: summary.sampleResult.passed,
        sampleTotal: summary.sampleResult.total,
        hiddenPassed: summary.hiddenResult.passed,
        hiddenTotal: summary.hiddenResult.total,
        codeBody: clampText(codeBody, 4000),
        language,
      })
      setLastSubmission(submission)
      setSolvedIds((prev) => new Set([...Array.from(prev), ...(passed ? [selected.id] : [])]))
      if (passed) {
        toast.success('All tests passed!')
      } else {
        toast.error('Some tests failed. Review the failures.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code execution failed.'
      toast.error(message)
      setResult({ ok: false, error: message })
    } finally {
      setIsRunning(false)
    }
  }

  if (!selected) {
    return (
      <div className="relative p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-secondary/20" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Coding Practice</p>
            <h1 className="text-3xl font-bold tracking-tight mt-2">Solve curated problems like a real interview</h1>
            <p className="text-muted-foreground mt-2">Pick a question to open the editor. Filters update instantly.</p>
          </div>
          <Card className="p-4 rounded-3xl border-border/40 shadow-sm bg-background/60 backdrop-blur">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="text-2xl font-bold mt-1">{solvedIds.size}/{challenges.length}</p>
            <p className="text-xs text-muted-foreground">problems solved</p>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((item) => (
            <Button
              key={item}
              variant={item === category ? 'default' : 'outline'}
              className="h-9 rounded-full px-4"
              onClick={() => setCategory(item)}
            >
              {item}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-background/70 px-4 py-2 w-full md:w-80 shadow-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions"
              className="border-none bg-transparent p-0 focus-visible:ring-0"
            />
          </div>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className="h-11 rounded-2xl bg-background w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              {['All', 'Easy', 'Medium', 'Hard'].map((level) => (
                <SelectItem key={level} value={level}>{level}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-11 rounded-2xl bg-background w-40">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Sort: Title</SelectItem>
              <SelectItem value="difficulty">Sort: Difficulty</SelectItem>
              <SelectItem value="acceptance">Sort: Acceptance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          {tagStats.map(([tag, count]) => (
            <Button
              key={tag}
              variant={selectedTags.includes(tag) ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => {
                setSelectedTags((prev) => prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag])
              }}
            >
              {tag} <span className="ml-2 text-[10px] text-muted-foreground">{count}</span>
            </Button>
          ))}
        </div>

        <Card className="p-4 rounded-3xl border-border/40 shadow-sm bg-background/70 backdrop-blur">
          <div className="grid grid-cols-[1.4fr,0.5fr,0.4fr] gap-4 px-2 pb-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span>Problems</span>
            <span>Difficulty</span>
            <span className="text-right">Acceptance</span>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No challenges match your filters.</div>
            ) : (
              filtered.map((challenge, index) => (
                <button
                  key={challenge.id}
                  onClick={() => setSelectedId(challenge.id)}
                  className="w-full text-left px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-4 border-border/40 hover:border-primary/30 hover:bg-secondary/20 hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{index + 1}.</span>
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-2">
                        {challenge.title}
                        {solvedIds.has(challenge.id) && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      </p>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{(challenge.tags || []).slice(0, 3).join(', ')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-8">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      challenge.difficulty.toLowerCase() === 'easy' ? 'bg-emerald-500/10 text-emerald-600' :
                      challenge.difficulty.toLowerCase() === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                      'bg-rose-500/10 text-rose-600'
                    }`}>
                      {challenge.difficulty}
                    </span>
                    <div className="text-xs text-muted-foreground text-right w-16">
                      {challenge.acceptance ? `${challenge.acceptance.toFixed(1)}%` : '--'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-full" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to list
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{selected.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-2">
              <span className={`px-2 py-0.5 rounded-full ${
                selected.difficulty.toLowerCase() === 'easy' ? 'bg-emerald-500/10 text-emerald-600' :
                selected.difficulty.toLowerCase() === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                'bg-rose-500/10 text-rose-600'
              }`}>
                {selected.difficulty}
              </span>
              {selected.category && (
                <span className="px-2 py-0.5 rounded-full bg-secondary/60">{selected.category}</span>
              )}
              {selected.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary/60">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Card className="px-4 py-2 rounded-2xl border-border/40 shadow-sm bg-background/70">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              Time limit
            </div>
            <p className="text-sm font-bold">{formatTimeLimit(selected.timeLimitMs)}</p>
          </Card>
          <Card className="px-4 py-2 rounded-2xl border-border/40 shadow-sm bg-background/70">
            <p className="text-xs text-muted-foreground">Acceptance</p>
            <p className="text-sm font-bold">{selected.acceptance ? `${selected.acceptance.toFixed(1)}%` : '--'}</p>
          </Card>
          <Card className="px-4 py-2 rounded-2xl border-border/40 shadow-sm bg-background/70">
            <p className="text-xs text-muted-foreground">Solved</p>
            <p className="text-sm font-bold">{solvedIds.size}/{challenges.length}</p>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,1fr] gap-6">
        <Card className="p-6 rounded-3xl border-border/40 shadow-sm bg-background/70 backdrop-blur space-y-4">
          <div className="flex items-center gap-6 text-sm border-b border-border/40 pb-3">
            {(['description', 'editorial', 'solutions', 'submissions'] as const).map((tab) => (
              <button
                key={tab}
                className={`capitalize font-semibold pb-2 ${
                  activeTab === tab ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'description' ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Code className="w-4 h-4 text-primary" />
                  {selected.title}
                </div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{selected.prompt}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-secondary text-xs font-semibold">{tag}</span>
                ))}
              </div>
              <div className="space-y-3">
                {examplesToShow.map((example, index) => (
                  <div key={index} className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Example {index + 1}</p>
                    <p className="text-xs text-muted-foreground">Input: {example.input}</p>
                    <p className="text-xs text-muted-foreground">Output: {example.output}</p>
                    {example.explanation && <p className="text-xs text-muted-foreground">{example.explanation}</p>}
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {selected.constraints.map((constraint, index) => (
                  <div key={index}>- {constraint}</div>
                ))}
              </div>
            </div>
          ) : activeTab === 'editorial' ? (
            <div className="text-sm text-muted-foreground space-y-3">
              <p>Editorials unlock after you solve the problem. Use the hints and test cases to iterate.</p>
              <p className="text-xs">Tip: Start with brute force, then optimize using the tags and constraints.</p>
            </div>
          ) : activeTab === 'solutions' ? (
            <div className="text-sm text-muted-foreground space-y-3">
              <p>Solutions unlock after you pass all hidden tests.</p>
              <p className="text-xs">Keep iterating with the test cases to reach an accepted solution.</p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {lastSubmission ? (
                <div className="space-y-2">
                  <p>Last submission: {lastSubmission.passed ? 'Accepted' : 'Needs work'}</p>
                  <p>Hidden tests: {lastSubmission.hiddenPassed}/{lastSubmission.hiddenTotal}</p>
                </div>
              ) : (
                <p>No submissions yet.</p>
              )}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr,0.85fr] gap-6">
          <Card className="p-6 rounded-3xl border-border/40 shadow-sm bg-background/70 backdrop-blur space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Terminal className="w-4 h-4 text-primary" />
                Code Workspace
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 rounded-full bg-secondary/40">{fileLabel}</span>
                <span>{editorStats.lines} lines</span>
                <span>•</span>
                <span>{editorStats.characters} chars</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-8 rounded-full bg-background w-36">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-2"
                  onClick={handleCopy}
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    const scaffold = scaffoldFor(language, selected)
                    setCodeBody(scaffold.starter)
                    setDrafts((prev) => ({
                      ...prev,
                      [selected.id]: { ...(prev[selected.id] || {}), [language]: scaffold.starter },
                    }))
                  }}
                >
                  Reset
                </Button>
                <Button onClick={runCode} disabled={isRunning} className="h-9 rounded-full px-4 gap-2">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-[#1f1f1f] text-[#d1d5db] overflow-hidden">
              <div className="px-4 py-2 text-xs border-b border-border/20 text-neutral-400">
                {scaffoldFor(language, selected).prefix}
              </div>
              <div className="flex text-sm font-mono">
                <div className="bg-[#171717] text-[#6b7280] px-3 py-3 text-right select-none">
                  {lineNumbers.map((line) => (
                    <div key={line} className="leading-6">{line}</div>
                  ))}
                </div>
                <Textarea
                  value={codeBody}
                  onChange={(e) => {
                    const value = e.target.value
                    setCodeBody(value)
                    setDrafts((prev) => ({
                      ...prev,
                      [selected.id]: { ...(prev[selected.id] || {}), [language]: value },
                    }))
                  }}
                  spellCheck={false}
                  className="min-h-[360px] rounded-none border-0 bg-[#1f1f1f] text-[#e5e7eb] focus-visible:ring-0 focus-visible:ring-offset-0 leading-6 text-[13px]"
                />
              </div>
            {scaffoldFor(language, selected).suffix ? (
              <div className="px-4 py-2 text-xs border-t border-border/20 text-neutral-400">
                {scaffoldFor(language, selected).suffix}
              </div>
            ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3" />
                Write only inside the solution body shown above.
              </div>
              <div>{editorStats.nonEmpty} non-empty lines</div>
            </div>
          </Card>

          <Card className="p-6 rounded-3xl border-border/40 shadow-sm bg-background/70 backdrop-blur space-y-4">
            <div className="flex items-center justify-between gap-3 text-sm font-bold">
              <span className="inline-flex items-center gap-2">
                Testcases
              </span>
              <Badge variant="secondary">{selected.sampleTests.length} samples</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selected.sampleTests.map((_, index) => (
                <Button
                  key={index}
                  variant={activeCase === index ? 'default' : 'outline'}
                  className="h-8 rounded-full px-4 text-xs"
                  onClick={() => setActiveCase(index)}
                >
                  Case {index + 1}
                </Button>
              ))}
            </div>
            <div className="rounded-2xl border border-border/40 bg-secondary/20 p-4 text-xs text-muted-foreground space-y-2">
              <p>Input: {JSON.stringify(selected.sampleTests[activeCase]?.input || [])}</p>
              <p>Expected: {JSON.stringify(selected.sampleTests[activeCase]?.output)}</p>
            </div>

            <div className="pt-2 border-t border-border/40">
              <h4 className="text-sm font-bold mb-2">Results</h4>
              {result && !result.error ? (
                <div className="flex items-center gap-3 text-sm mb-2">
                  <span className={`font-semibold ${result.hiddenResult?.failures?.length ? 'text-destructive' : 'text-emerald-600'}`}>
                    {result.hiddenResult?.failures?.length ? 'Wrong Answer' : 'Accepted'}
                  </span>
                  <span className="text-xs text-muted-foreground">Runtime: -- ms</span>
                </div>
              ) : null}
              {result?.error ? (
                <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  {result.error}
                </div>
              ) : result ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    {result.hiddenResult?.failures?.length === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <p className="font-semibold">
                      Hidden Tests: {result.hiddenResult?.passed}/{result.hiddenResult?.total}
                    </p>
                  </div>
                  {result.sampleResult?.failures?.length ? (
                    <div className="space-y-2">
                      <p className="font-semibold">Sample Failures</p>
                      {result.sampleResult.failures.map((failure: any, index: number) => (
                        <div key={index} className="p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                          <p>Input: {JSON.stringify(failure.input)}</p>
                          <p>Expected: {JSON.stringify(failure.expected)}</p>
                          <p>Actual: {JSON.stringify(failure.actual)}</p>
                          {failure.error && <p>Error: {failure.error}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sample tests passed.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Run tests to see results.</p>
              )}
              {lastSubmission && (
                <div className="text-xs text-muted-foreground mt-3">
                  Last submission: {lastSubmission.passed ? 'Passed' : 'Needs work'} | Hidden {lastSubmission.hiddenPassed}/{lastSubmission.hiddenTotal}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
