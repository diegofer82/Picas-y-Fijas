/* -------------------- la cuenta de puntos (E5-T1) --------------------
   Hasta la 3.9.1 el ranking ordenaba por victorias y desempataba por partidas
   jugadas. Quien jugaba doscientas y perdia la mitad iba por delante de quien
   ganaba nueve de diez, y el que llego primero se quedaba arriba para siempre.
   Aqui vive la regla nueva, y vive sola: no toca la base, no lee nada, no
   escribe nada. Se le da una partida terminada y devuelve lo que vale para
   cada uno de los dos. Asi se puede comprobar con una prueba sin levantar un
   Worker, y asi el dia que la formula se afine no hay que buscarla por el
   archivo de rutas.

   La formula premia dos cosas que el jugador elige y no le regala nada por
   insistir:

   - la dificultad de las reglas: cuantos codigos posibles hay, mas el castigo
     voluntario de jugar con intentos contados o con reloj;
   - la economia de intentos: descubrir el codigo en cuatro vale mas que
     descubrirlo en nueve.

   Perder suma uno. No es caridad: es lo que impide que abandonar una partida
   perdida salga mas barato que terminarla. Abandonar, eso si, vale cero. */
import { hasClock, isCorrespondenceGame, maxSymbolFor, parseJsonList, toInt, truthy } from "./game.js";

export const SCORE = Object.freeze({
  win: 10,
  draw: 4,
  loss: 1,
  forfeit: 6,
  maxDifficulty: 14,
  // El presupuesto de intentos: resolver en 4 da 6 puntos, en 7 da 0. Por
  // encima de siete intentos la economia deja de contar, no se vuelve negativa.
  attemptBudget: 14,
});

// La temporada es el mes natural en UTC. No hace falta mas: el reinicio no es
// un evento con hora, es un cajon nuevo donde caen las partidas del mes.
export const SEASON_ALL = "all";
export const seasonOf = (value) => {
  const iso = typeof value === "string" && value ? value : new Date(value || Date.now()).toISOString();
  return /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : new Date().toISOString().slice(0, 7);
};

// Cuantos codigos distintos podria haber elegido el rival. Con repeticiones es
// una potencia; sin ellas, una permutacion.
export function codeSpace(game) {
  const digits = Math.max(1, toInt(game.digits, 3));
  const symbols = Math.max(2, maxSymbolFor(game.mode, game.num_colors));
  if (truthy(game.allow_repeats)) return Math.pow(symbols, digits);
  let space = 1;
  for (let index = 0; index < digits; index++) space *= Math.max(1, symbols - index);
  return space;
}

export function difficulty(game) {
  const space = Math.max(2, codeSpace(game));
  let value = Math.round(2 * Math.log10(space));
  if (toInt(game.max_attempts) > 0) value += 2;
  // La correspondencia da dias por jugada: es comodidad, no presion.
  if (hasClock(game) && !isCorrespondenceGame(game)) value += 2;
  return Math.max(0, Math.min(SCORE.maxDifficulty, value));
}

export const rulesKey = (game) =>
  [
    game.mode === "colors" ? `c${maxSymbolFor(game.mode, game.num_colors)}` : "n",
    toInt(game.digits, 3),
    truthy(game.allow_repeats) ? "rep" : "norep",
  ].join("-");

function playerGuesses(game, username) {
  return parseJsonList(game.guesses).filter((entry) => entry.by === username);
}

export function attemptsOf(game, username) {
  return playerGuesses(game, username).length;
}

// Descubrio el codigo, o gano porque al rival se le acabo el tiempo o se fue.
export function solvedBy(game, username) {
  const digits = toInt(game.digits, 3);
  return playerGuesses(game, username).some((entry) => toInt(entry.fijas) === digits);
}

function economy(attempts) {
  return Math.max(0, SCORE.attemptBudget - 2 * Math.max(1, attempts));
}

/* Lo que vale una partida terminada para cada uno de los dos. Devuelve siempre
   las dos filas, tambien la del que perdio: el ranking cuenta partidas
   jugadas, no solo ganadas, y el perfil de E5-T2 sale de la misma suma. */
export function scoreGame(game) {
  if (!game || game.status !== "finished") return null;
  const dif = difficulty(game);
  const reason = String(game.finish_reason || "");
  const sides = [
    { username: game.p1, country: game.country1 || "" },
    { username: game.p2, country: game.country2 || "" },
  ].filter((side) => side.username);
  if (sides.length < 2) return null;
  const winner = String(game.winner || "");
  return {
    gameId: game.game_id,
    season: seasonOf(game.updated_at),
    difficulty: dif,
    rules: rulesKey(game),
    reason,
    players: sides.map((side) => {
      const attempts = attemptsOf(game, side.username);
      const won = winner === side.username;
      const result = winner ? (won ? "win" : "loss") : "draw";
      const solved = won && solvedBy(game, side.username);
      let points;
      if (won) points = reason === "abandon" ? SCORE.forfeit : SCORE.win + dif + (solved ? economy(attempts) : 0);
      else if (result === "draw") points = SCORE.draw + Math.round(dif / 2);
      // Quien se va de una partida empezada no se lleva el punto de haberla jugado.
      else points = reason === "abandon" ? 0 : SCORE.loss;
      return { ...side, result, points, attempts, solved, difficulty: dif };
    }),
  };
}
