/* El solucionador, fuera del rival (E4-T1).
   Todo lo que este juego sabe deducir vivia dentro de `computer-ai.js`, es
   decir dentro del adversario de la practica. Pero deducir no es ser el rival:
   es medir cuantos codigos siguen siendo posibles despues de unas pistas y
   cuanto parte esa lista un intento. Eso mismo hace falta para puntuar una
   partida terminada, para avisar de una contradiccion, para explicar lo que
   piensa el ordenador y para fabricar enigmas con solucion unica. Aqui esta,
   en un solo sitio y sin saber nunca ningun secreto: solo recibe intentos y
   sus puntuaciones. */
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

  /* Cuantos codigos hay, sin fabricar ni uno: enumerar un espacio de un millon
     en el telefono de alguien no es gratis y conviene saberlo antes. */
  function spaceSize(rules) {
    const symbols = symbolCount(rules), digits = Number(rules.digits);
    if (!(symbols > 0) || !(digits > 0)) return 0;
    if (rules.allowRepeats) return Math.pow(symbols, digits);
    if (digits > symbols) return 0;
    let total = 1;
    for (let i = 0; i < digits; i++) total *= symbols - i;
    return total;
  }

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

  function filter(candidates, guess, score) {
    return candidates.filter((candidate) => sameScore(evaluate(candidate, guess), score));
  }

  /* Como parte un intento una lista de posibles: cuantos caen en el grupo mas
     grande (el peor caso) y la suma de cuadrados, que premia los repartos
     parejos cuando dos intentos empatan en el peor caso. */
  function split(candidates, guess) {
    const buckets = new Map();
    for (const candidate of candidates) {
      const score = evaluate(candidate, guess);
      const key = score.fijas + ':' + score.picas;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    let worst = 0, squares = 0;
    for (const size of buckets.values()) { worst = Math.max(worst, size); squares += size * size; }
    return { buckets, worst, squares, groups: buckets.size };
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

  /* El mejor intento que se encuentra mirando una muestra. Empate en el peor
     caso y en los cuadrados: gana el que ademas podria ser el codigo, porque
     ese ademas puede ganar la partida en el sitio. */
  function bestProbe(candidates, all, random, options) {
    const rnd = random || Math.random;
    const opts = options || {};
    const secretLimit = opts.secretLimit || 420, probeLimit = opts.probeLimit || 90, outsideLimit = opts.outsideLimit || 45;
    if (candidates.length <= 2) return { guess: candidates[0], worst: 1, squares: candidates.length, secrets: candidates.slice() };
    const secrets = sample(candidates, secretLimit, rnd);
    const probes = sample(candidates, probeLimit, rnd);
    const candidateProbeCount = probes.length;
    if (all && all.length <= 5000 && outsideLimit > 0) probes.push(...sample(all, outsideLimit, rnd));
    let best = probes[0], bestWorst = Infinity, bestSquares = Infinity, bestCandidate = false;
    for (let probeIndex = 0; probeIndex < probes.length; probeIndex++) {
      const guess = probes[probeIndex];
      const { worst, squares } = split(secrets, guess);
      const isCandidate = probeIndex < candidateProbeCount;
      if (worst < bestWorst || (worst === bestWorst && squares < bestSquares) ||
          (worst === bestWorst && squares === bestSquares && isCandidate && !bestCandidate)) {
        best = guess; bestWorst = worst; bestSquares = squares; bestCandidate = isCandidate;
      }
    }
    return { guess: best, worst: bestWorst, squares: bestSquares, secrets };
  }

  /* El aviso de contradiccion (E4-T3). Un intento contradice las pistas
     propias cuando, tomado como si fuera el codigo del rival, no habria dado
     las puntuaciones que ya estan en la pantalla: es decir, ya estaba
     descartado antes de escribirlo. No hace falta enumerar nada para saberlo
     —basta releer el propio historial—, asi que sirve igual en una partida de
     seis simbolos que en una de tres. Los turnos perdidos al tiempo no dicen
     nada y no cuentan. */
  function contradicts(candidate, history) {
    const code = String(candidate || '');
    const clues = (history || []).filter((turn) => turn && !turn.missed
      && typeof turn.guess === 'string' && turn.guess.length === code.length);
    if (!code.length || !clues.length) return false;
    return !compatible(code, clues);
  }

  /* Ver pensar al ordenador (E4-T4). Cuantos codigos seguian en pie antes del
     intento y en cuantos grupos los parte: son las dos cifras con las que se
     explica una jugada. `before` es exacto y no cuesta nada, porque el
     solucionador ya mantiene la lista; el reparto si hay que recorrerla, asi
     que por encima de este limite se calla en vez de bloquear el telefono. */
  var EXPLAIN_LIMIT = 20000;

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
        candidates = filter(candidates, guess, score);
      },
      explain(guess) {
        ensureCandidates();
        const before = candidates.length;
        const groups = before <= EXPLAIN_LIMIT ? split(candidates, String(guess)).groups : 0;
        return { before, groups };
      },
      nextGuess() {
        ensureCandidates();
        if (!candidates.length) throw new Error('No hay combinaciones compatibles con las pistas.');
        if (difficulty === 'expert') return bestProbe(candidates, all, random).guess;
        if (difficulty === 'normal') return candidates[0];
        return candidates[randomIndex(candidates.length, random)];
      },
    };
  }

  /* La partida que se explica (E4-T2).
     Se rehace la partida desde fuera, sin el secreto: antes de cada intento se
     sabe cuantos codigos seguian en pie, y se compara lo que hizo quien jugaba
     con lo que habria hecho el mejor intento que encuentra `bestProbe` sobre
     la misma muestra. La nota juzga la decision, no la suerte: un intento que
     parte bien la lista es bueno aunque el resultado saliera flojo.
     La jugada decisiva es aquella tras la cual solo quedaba un codigo: ahi la
     partida ya estaba ganada y lo que vino despues fue escribirlo. */
  var GRADE_LIMIT = 200000;

  function gradeGame(rules, guesses, options) {
    const opts = options || {};
    const limit = opts.limit || GRADE_LIMIT;
    const digits = Number(rules.digits);
    const played = (guesses || []).filter((turn) => turn && !turn.missed && typeof turn.guess === 'string' && turn.guess.length === digits);
    const size = spaceSize(rules);
    if (!played.length || !size || size > limit) return { available: false, notes: [], decisiveIndex: -1, total: size };
    const random = opts.random || (() => 0.5);
    const all = enumerate(rules);
    let candidates = all;
    const notes = [];
    let decisiveIndex = -1;
    for (let index = 0; index < played.length; index++) {
      const turn = played[index];
      const score = { fijas: Number(turn.fijas) || 0, picas: Number(turn.picas) || 0 };
      const before = candidates.length;
      let label;
      if (before <= 1) {
        label = candidates[0] === turn.guess ? 'optimal' : 'wasted';
      } else {
        const reference = bestProbe(candidates, all, random);
        const mine = split(reference.secrets, turn.guess).worst;
        if (mine <= reference.worst) label = 'optimal';
        else if (mine <= Math.max(reference.worst * 1.5, reference.worst + 1)) label = 'good';
        else label = 'wasted';
      }
      candidates = filter(candidates, turn.guess, score);
      const after = candidates.length;
      if (decisiveIndex < 0 && before > 1 && after === 1) decisiveIndex = index;
      notes.push({ index, guess: turn.guess, label, before, after, fijas: score.fijas, picas: score.picas });
    }
    if (decisiveIndex < 0) {
      let bestIndex = -1, bestRatio = 1;
      for (const note of notes)
        if (note.after > 0 && note.after < note.before && note.before / note.after > bestRatio) { bestRatio = note.before / note.after; bestIndex = note.index; }
      decisiveIndex = bestIndex;
    }
    return { available: true, notes, decisiveIndex, total: size };
  }

  root.Deduce = Object.freeze({
    evaluate, sameScore, symbolCount, spaceSize, enumerate, compatible,
    filter, split, sample, bestProbe, contradicts, createSolver, gradeGame,
    GRADE_LIMIT, EXPLAIN_LIMIT,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
