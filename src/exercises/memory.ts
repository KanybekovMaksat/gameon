// What a task keeps for «Ещё раз» (the robot grid keeps the program). The session clears it when it moves
// past a task or starts, so a task that comes back after the explanation or in a new run starts clean.
export const retryMemory = new Map<unknown, unknown>()
