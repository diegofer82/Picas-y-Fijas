(function (root) {
  'use strict';

  function evaluate(secret, guess) {
    let fijas = 0;
    const secretCounts = Object.create(null);
    const guessCounts = Object.create(null);
    for (let i = 0; i < secret.length; i++) {
      if (secret[i] === guess[i]) fijas++;
      else {
        secretCounts[secret[i]] = (secretCounts[secret[i]] || 0) + 1;
        guessCounts[guess[i]] = (guessCounts[guess[i]] || 0) + 1;
      }
    }
    let picas = 0;
    for (const symbol of Object.keys(guessCounts)) picas += Math.min(guessCounts[symbol], secretCounts[symbol] || 0);
    return { fijas, picas };
  }

  function sameScore(a, b) { return a.fijas === b.fijas && a.picas === b.picas; }
  function symbolCount(rules) { return rules.mode === 'colors' ? Number(rules.numColors) : 10; }

  function enumerate(rules) {
    const output = [];
    const max = symbolCount(rules);
    function visit(prefix) {
      if (prefix.length === Number(rules.digits)) { output.push(prefix); return; }
      for (let symbol = 0; symbol < max; symbol++) {
        const value = String(symbol);
        if (!rules.allowRepeats && prefix.includes(value)) continue;
        visit(prefix + value);
      }
    }
    visit('');
    return output;
  }

  function compatible(candidate, history) {
    return history.every((turn) => sameScore(evaluate(candidate, turn.guess), turn));
  }

  function randomIndex(max, random) { return max > 0 ? Math.floor(random() * max) % max : 0; }
  function sample(items, limit, random) {
    if (items.length <= limit) return items.slice();
    const picked = [];
    const step = Math.max(1, Math.floor(items.length / limit));
    const start = randomIndex(step, random);
    for (let index = 0; index < limit; index++) picked.push(items[(start + index * step) % items.length]);
    return picked;
  }

  function strategicGuess(candidates, all, random) {
    if (candidates.length <= 2) return candidates[0];
    const secrets = sample(candidates, 420, random);
    const probes = sample(candidates, 90, random);
    const candidateProbeCount = probes.length;
    if (all.length <= 5000) probes.push(...sample(all, 45, random));
    let best = probes[0], bestWorst = Infinity, bestSquares = Infinity, bestCandidate = false;
    for (let probeIndex = 0; probeIndex < probes.length; probeIndex++) {
      const guess = probes[probeIndex];
      const buckets = new Map();
      for (const secret of secrets) {
        const score = evaluate(secret, guess);
        const key = score.fijas + ':' + score.picas;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      let worst = 0, squares = 0;
      for (const size of buckets.values()) { worst = Math.max(worst, size); squares += size * size; }
      const isCandidate = probeIndex < candidateProbeCount;
      if (worst < bestWorst || (worst === bestWorst && squares < bestSquares) ||
          (worst === bestWorst && squares === bestSquares && isCandidate && !bestCandidate)) {
        best = guess; bestWorst = worst; bestSquares = squares; bestCandidate = isCandidate;
      }
    }
    return best;
  }

  function createSolver(rules, difficulty, options) {
    const random = options && options.random ? options.random : Math.random;
    const history = [];
    let all = null, candidates = null;
    function ensureCandidates() { if (!all) { all = enumerate(rules); candidates = all.slice(); } }
    return {
      rules: { ...rules },
      difficulty,
      history,
      candidateCount() { ensureCandidates(); return candidates.length; },
      record(guess, score) {
        ensureCandidates();
        history.push({ guess: String(guess), fijas: Number(score.fijas), picas: Number(score.picas) });
        candidates = candidates.filter((candidate) => sameScore(evaluate(candidate, guess), score));
      },
      nextGuess() {
        ensureCandidates();
        if (!candidates.length) throw new Error('No hay combinaciones compatibles con las pistas.');
        if (difficulty === 'expert') return strategicGuess(candidates, all, random);
        if (difficulty === 'normal') return candidates[0];
        return candidates[randomIndex(candidates.length, random)];
      },
    };
  }

  root.ComputerAI = Object.freeze({ createSolver, enumerate, evaluate, compatible });
})(typeof globalThis !== 'undefined' ? globalThis : window);
