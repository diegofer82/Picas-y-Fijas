/* El rival de la practica. Desde E4-T1 ya no guarda ningun saber propio: todo
   lo que sabe deducir vive en `deduce.js`, que se carga antes. Este archivo
   queda como el nombre por el que la practica llama al adversario, para que
   manana se le pueda dar caracter sin tocar el motor, y para que el motor
   pueda servir a las otras pantallas sin arrastrar al rival. */
(function (root) {
  'use strict';

  const engine = root.Deduce;
  if (!engine) throw new Error('deduce.js debe cargarse antes que computer-ai.js');

  root.ComputerAI = Object.freeze({
    createSolver: engine.createSolver,
    enumerate: engine.enumerate,
    evaluate: engine.evaluate,
    compatible: engine.compatible,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
