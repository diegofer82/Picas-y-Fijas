/* -------------------- los enigmas resueltos, en la cuenta (5.3.0) ----------
   Hasta la 5.2.1 lo resuelto vivia solo en `localStorage`, y cambiar de
   aparato o de navegador era empezar de cero. Ahora la cuenta lo guarda, y de
   ahi salen cuatro insignias: una por nivel terminado y otra por terminarlos
   todos.

   Sin cuenta, nada cambia: el invitado sigue jugando sin una sola llamada al
   API. Con cuenta hay una accion, `puzzleSync`, que sirve para las dos cosas
   —leer lo resuelto y apuntar lo nuevo— y que la pantalla llama al abrirse y
   al resolver un enigma, nunca en un sondeo.

   El servidor no se fia de una lista de identificadores: cada enigma llega
   con su respuesta y se comprueba contra las pistas, igual que hace la
   pantalla. Como la solucion es unica, ser compatible con las pistas y ser la
   solucion son lo mismo, asi que aqui tampoco hay ninguna respuesta guardada.
   Una respuesta que no encaja se descarta antes de tocar D1: equivocarse no
   cuesta ni una lectura. */
import PUZZLES from "./puzzle-data.js";
import { evaluate, maxSymbolFor, validateCode } from "./game.js";

const now = () => new Date().toISOString();

const BY_ID = new Map();
export const PUZZLE_LEVELS = Object.freeze(
  PUZZLES.levels.map((level) => {
    for (const puzzle of level.puzzles)
      BY_ID.set(puzzle.id, { level: level.level, rules: level.rules, clues: puzzle.clues });
    return Object.freeze({ level: level.level, total: level.puzzles.length, badge: `puzzles_${level.level}` });
  }),
);
export const PUZZLE_TOTAL = BY_ID.size;
export const PUZZLE_BADGE_ALL = "puzzles_all";

export function solvesPuzzle(id, code) {
  const puzzle = BY_ID.get(String(id));
  if (!puzzle) return false;
  const { rules } = puzzle;
  if (validateCode(code, rules.digits, rules.allowRepeats, maxSymbolFor(rules.mode, rules.numColors))) return false;
  return puzzle.clues.every(([guess, fijas, picas]) => {
    const score = evaluate(code, guess);
    return score.fijas === fijas && score.picas === picas;
  });
}

/* `answers` viaja como texto —"easy-01:123,normal-07:4567"— porque el API solo
   entiende valores simples (`safeParams`). Lo que no sea un enigma con su
   respuesta buena se ignora sin protestar: la lista que vuelve dice lo que
   quedo apuntado. */
function acceptedAnswers(value) {
  const accepted = new Set();
  for (const pair of String(value ?? "").split(",").slice(0, PUZZLE_TOTAL * 2)) {
    const [id, code] = pair.trim().split(":");
    if (id && code && solvesPuzzle(id, code)) accepted.add(id);
  }
  return [...accepted];
}

/* Lo nuevo y sus insignias entran en un mismo `batch`, que en D1 es una
   transaccion: la insignia se apunta con un INSERT que cuenta las filas del
   nivel en ese mismo instante. Asi dos aparatos que terminan el nivel a la vez
   con enigmas distintos no se quedan los dos sin ella, que es lo que pasaria
   contando antes en JavaScript. La clave primaria de `badges` hace el resto:
   solo el INSERT que la escribe la anuncia como nueva. */
export async function puzzleSync(db, user, params) {
  const key = user.username_key;
  const accepted = acceptedAnswers(params.answers);
  let newBadges = [];
  if (accepted.length) {
    const stamp = now();
    const touched = new Set(accepted.map((id) => BY_ID.get(id).level));
    const badges = [
      ...PUZZLE_LEVELS.filter((level) => touched.has(level.level)).map((level) => ({
        code: level.badge,
        like: `${level.level}-%`,
        total: level.total,
      })),
      { code: PUZZLE_BADGE_ALL, like: "%", total: PUZZLE_TOTAL },
    ];
    const written = await db.batch([
      ...accepted.map((id) =>
        db
          .prepare("INSERT OR IGNORE INTO puzzle_solves(username_key,puzzle_id,solved_at) VALUES(?,?,?)")
          .bind(key, id, stamp),
      ),
      ...badges.map((badge) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO badges(username_key,code,earned_at,game_id,detail)
             SELECT ?1,?2,?3,'',?4
             WHERE (SELECT COUNT(*) FROM puzzle_solves WHERE username_key=?1 AND puzzle_id LIKE ?5)>=?6`,
          )
          .bind(key, badge.code, stamp, String(badge.total), badge.like, badge.total),
      ),
    ]);
    newBadges = badges
      .filter((_, index) => Number(written[accepted.length + index]?.meta?.changes) === 1)
      .map((badge) => badge.code);
  }
  const { results } = await db
    .prepare("SELECT puzzle_id FROM puzzle_solves WHERE username_key=? ORDER BY puzzle_id")
    .bind(key)
    .all();
  return {
    ok: true,
    solved: results.map((row) => row.puzzle_id),
    ...(newBadges.length ? { newBadges } : {}),
  };
}
