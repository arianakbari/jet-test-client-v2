<template>
  <v-app class="app-background">
    <v-dialog v-model="dialog.open" width="auto" persistent>
      <v-card
        max-width="1000"
        min-width="500"
        min-height="300"
        max-height="600"
        :title="dialog.title"
        :text="dialog.text"
      >
        <template v-slot:actions>
          <v-btn class="ms-auto" :text="dialog.buttonText" @click="dialog.buttonClick()"></v-btn>
        </template>
      </v-card>
    </v-dialog>
    <v-main>
      <v-container>
        <v-row justify="center">
          <v-col cols="12" align-self="end">
            <h1 class="display-1 text-center">Game of Three</h1>
          </v-col>
          <v-col cols="12" sm="8" md="8" xs="10" xl="4" xxl="4">
            <v-card class="game-card" v-if="!gameStarted && !waitingForAnotherPlayer" color="blue-grey-lighten-4">
              <v-card-title class="text-center">Start Game</v-card-title>
              <v-card-text>
                <v-text-field v-model="email" label="Email" type="email"></v-text-field>
              </v-card-text>
              <v-card-actions class="justify-center">
                <v-btn @click="joinGame" color="black" :loading="loading" :disabled="!email">Start</v-btn>
              </v-card-actions>
            </v-card>
            <v-card class="game-card" v-if="waitingForAnotherPlayer" color="blue-grey-lighten-4">
              <v-card-text>
                <h2 class="text-center">Waiting for another player to join</h2>
              </v-card-text>
              <v-card-text class="text-center">
                <v-progress-circular indeterminate></v-progress-circular>
              </v-card-text>
            </v-card>
            <v-card
              class="game-card"
              v-if="gameStarted && gameSession?.currentTurnPlayerId !== player?.id"
              color="blue-grey-lighten-4"
            >
              <v-card-text>
                <h2 class="text-center">Waiting for opponent to play his turn</h2>
              </v-card-text>
              <v-card-text class="text-center">
                <v-progress-circular indeterminate></v-progress-circular>
              </v-card-text>
            </v-card>
            <v-card
              class="game-card"
              v-if="gameStarted && gameSession?.currentTurnPlayerId === player?.id"
              color="blue-grey-lighten-4"
            >
              <v-card-title class="text-center">Make Your Move</v-card-title>
              <v-card-text class="text-center" style="margin-top: 10px"
                ><h1>Number: {{ gameSession?.number }}</h1></v-card-text
              >
              <v-card-text>
                <v-select
                  label="Your Move"
                  :items="[-1, 0, 1]"
                  variant="outlined"
                  type="number"
                  v-model="choice"
                ></v-select>
              </v-card-text>
              <v-card-actions class="justify-center">
                <v-btn @click="makeMove" color="black" :loading="loading" :disabled="choice === null">Make Move</v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import Pusher, { type AuthorizerCallback } from "pusher-js";
import axios from "axios";
import { GAME_EVENTS, GAME_STATUS, type GameSession, joinGame, makeMove, type Player, subscribe } from "./api/api";

export default defineComponent({
  name: "App",
  async beforeMount() {
    const email = localStorage.getItem("email");
    if (email) {
      this.email = email;
      await this.joinGame();
    }
  },
  data() {
    return {
      dialog: {
        open: false,
        text: "",
        title: "",
        buttonText: "",
        buttonClick: () => {},
      },
      email: "",
      token: "",
      player: null as Player | null,
      choice: null as number | null,
      waitingForAnotherPlayer: false,
      gameStarted: false,
      gameSession: null as GameSession | null,
      loading: false,
      pusher: null as Pusher | null,
    };
  },
  methods: {
    async joinGame() {
      try {
        this.loading = true;
        const response = await joinGame(this.email);
        this.token = response.token;
        this.gameSession = response.game;
        this.player = response.game.players.find((p) => p.email === this.email)!;
        await this.subscribe(this.player.id, response.token);
        this.waitingForAnotherPlayer = this.gameSession.status === GAME_STATUS.WAITING_FOR_PLAYER;
        this.gameStarted = this.gameSession.status === GAME_STATUS.IN_PROGRESS;
        localStorage.setItem("email", this.email);
      } catch (e) {
        this.dialog = {
          open: true,
          title: "Error",
          text: this.getErrorMessage(e as Error),
          buttonText: "Close",
          buttonClick: () => this.closeDialog(),
        };
      } finally {
        this.loading = false;
        this.email = "";
      }
    },
    async makeMove() {
      try {
        this.loading = true;
        const response = await makeMove(this.choice!, this.gameSession?.id!, this.token);
        if (response.status === GAME_STATUS.FINISHED) {
          return this.finishGame(true);
        }
        this.gameSession = response;
        this.choice = null;
      } catch (e) {
        this.dialog = {
          open: true,
          title: "Error",
          text: this.getErrorMessage(e as Error),
          buttonText: "Close",
          buttonClick: () => this.closeDialog(),
        };
      } finally {
        this.loading = false;
      }
    },

    getErrorMessage(e: Error): string {
      if (axios.isAxiosError(e)) {
        return e?.response?.data.message;
      }
      return e.message;
    },

    async subscribe(playerId: string, token: string) {
      this.pusher = new Pusher(import.meta.env.VITE_PUSHER_KEY || "", {
        cluster: import.meta.env.VITE_PUSHER_CLUSTER || "eu",
        authorizer: () => ({
          authorize: async (socketId: string, callback: AuthorizerCallback) => {
            subscribe(socketId, token)
              .then((res) => callback(null, res))
              .catch((e) => callback(e, null as never));
          },
        }),
      });
      const channel = this.pusher.subscribe(`private-user-channel-${playerId}`);
      channel.bind(GAME_EVENTS.JOINED, (data: GameSession) => {
        this.gameStarted = true;
        this.waitingForAnotherPlayer = false;
        this.gameSession = data;
      });
      channel.bind(GAME_EVENTS.FINISHED, () => {
        this.finishGame(false);
      });
      channel.bind(GAME_EVENTS.TURN_PLAYED, (data: GameSession) => {
        this.gameSession = data;
      });
    },
    unsubscribe() {
      this.pusher?.unsubscribe(`private-user-channel-${this.player?.id}`);
      this.pusher = null;
    },
    finishGame(isWinner: boolean) {
      this.dialog = {
        open: true,
        title: "End of the game!",
        text: isWinner ? "Congratulations! You are the winner!" : "Oops! You're not lucky this time!",
        buttonText: "Close",
        buttonClick: () => {
          this.reset();
          this.closeDialog();
        },
      };
    },
    reset() {
      this.unsubscribe();
      this.token = "";
      this.email = "";
      localStorage.removeItem("email");
      this.gameSession = null;
      this.player = null;
      this.choice = null;
      this.loading = false;
      this.gameStarted = false;
      this.waitingForAnotherPlayer = false;
    },
    closeDialog() {
      this.dialog = {
        open: false,
        text: "",
        title: "",
        buttonText: "",
        buttonClick: () => {},
      };
    },
  },
});
</script>

<style scoped>
.v-container {
  height: 100%;
}

.v-row {
  height: 100%;
}

.app-background {
  background-color: #eceff1; /* Light grey background for the entire app */
}
.game-card {
  margin-top: 20px;
  border-radius: 10px;
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.08);
}
</style>
