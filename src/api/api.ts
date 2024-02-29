import axios from "axios";

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

export interface Player {
  id: string;
  email: string;
}

export enum GAME_STATUS {
  WAITING_FOR_PLAYER = "WAITING_FOR_PLAYER",
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED",
}

export interface GameSession {
  id: string;
  number: number;
  players: Player[];
  currentTurnPlayerId: string | null;
  status: GAME_STATUS;
}

export type GameResponse = { game: GameSession; token: string };

export type SubscriptionResponse = {
  auth: string;
  channel_data?: string;
  shared_secret?: string;
  channelId: string;
};

export enum GAME_EVENTS {
  JOINED = "JOINED",
  TURN_PLAYED = "TURN_PLAYED",
  STARTED = "STARTED",
  FINISHED = "FINISHED",
}

export const joinGame = async (email: string): Promise<GameResponse> => {
  try {
    const response = await instance.post("/api/v1/game/join", { email });
    return response.data;
  } catch (e) {
    console.log(e);
    throw e;
  }
};

export const makeMove = async (choice: number, gameId: string, token: string): Promise<GameSession> => {
  try {
    const response = await instance.post(
      "/api/v1/game/make-move",
      { choice, gameId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (e) {
    console.log(e);
    throw e;
  }
};

export const subscribe = async (socketId: string, token: string): Promise<SubscriptionResponse> => {
  try {
    const response = await instance.post(
      "/api/v1/game/subscribe",
      { socketId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (e) {
    console.log(e);
    throw e;
  }
};
