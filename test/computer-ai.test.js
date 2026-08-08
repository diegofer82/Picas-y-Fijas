import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/computer-ai.js', import.meta.url), 'utf8');
const context = vm.createContext({ Math });
vm.runInContext(source, context);
const { createSolver, enumerate, evaluate, compatible } = context.ComputerAI;

test('candidate generation respects positions, symbols, colors, and repeat rules', () => {
  assert.equal(enumerate({ mode:'colors', numColors:4, digits:3, allowRepeats:true }).length, 64);
  assert.equal(enumerate({ mode:'colors', numColors:4, digits:3, allowRepeats:false }).length, 24);
  assert.equal(enumerate({ mode:'numbers', digits:3, allowRepeats:false }).length, 720);
});

test('every difficulty guesses only codes compatible with all received clues', () => {
  const rules={mode:'colors',numColors:6,digits:4,allowRepeats:true};
  const secret='5042';
  for(const difficulty of ['easy','normal','expert']){
    const solver=createSolver(rules,difficulty,{random:()=>0.314159});
    const history=[];
    for(let turn=0;turn<12;turn++){
      const guess=solver.nextGuess();
      assert.equal(compatible(guess,history),true,`${difficulty} contradicted a previous clue`);
      const score=evaluate(secret,guess);
      history.push({guess,...score}); solver.record(guess,score);
      if(score.fijas===rules.digits) break;
    }
    assert.equal(history.at(-1).fijas,rules.digits,`${difficulty} did not solve a finite candidate space`);
  }
});

test('the solver API never receives or stores the player secret', () => {
  const solver=createSolver({mode:'numbers',digits:3,numColors:10,allowRepeats:false},'normal');
  assert.deepEqual(Object.keys(solver).sort(),['candidateCount','difficulty','history','nextGuess','record','rules']);
  assert.equal('secret' in solver,false);
  solver.record('012',evaluate('321','012'));
  assert.equal(compatible(solver.nextGuess(),solver.history),true);
});
