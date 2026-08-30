import { defineStore } from 'pinia';
import { api, API_BASE } from '@/api';
import type { Task } from '@/types';

const TERMINAL = ['completed', 'failed', 'cancelled'];

let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let stopped = false;

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as Task[],
    connected: false,
    loaded: false,
  }),
  getters: {
    activeTasks: (s) => s.tasks.filter((t) => !TERMINAL.includes(t.status)),
    terminalTasks: (s) => s.tasks.filter((t) => TERMINAL.includes(t.status)),
    byId: (s) => (id: string) => s.tasks.find((t) => t.id === id),
    activeCount: (s) =>
      s.tasks.filter((t) => t.status === 'downloading' || t.status === 'parsing').length,
    waitingCount: (s) => s.tasks.filter((t) => t.status === 'waiting').length,
  },
  actions: {
    async fetch() {
      try {
        this.tasks = await api.listTasks();
        this.loaded = true;
      } catch {
        /* 后端未就绪 */
      }
    },
    upsert(task: Task) {
      const i = this.tasks.findIndex((t) => t.id === task.id);
      if (i >= 0) {
        const previous = this.tasks[i];
        const active = ['waiting', 'parsing', 'downloading', 'paused'];
        // 防御迟到的 SSE / 轮询响应覆盖更新的进度，造成进度条视觉回退。
        if (active.includes(previous.status) && active.includes(task.status)) {
          task = {
            ...task,
            progress: Math.max(previous.progress, task.progress),
            downloadedBytes: Math.max(previous.downloadedBytes, task.downloadedBytes),
          };
        }
        this.tasks[i] = task;
      }
      else this.tasks.unshift(task);
    },
    replace(list: Task[]) {
      this.tasks = list;
      this.loaded = true;
    },
    removeLocal(id: string) {
      this.tasks = this.tasks.filter((t) => t.id !== id);
    },

    connect() {
      stopped = false;
      if (typeof EventSource === 'undefined') {
        this.startPolling();
        return;
      }
      this.openStream();
    },

    openStream() {
      if (stopped || eventSource) return;
      const es = new EventSource(`${API_BASE}/events`);
      eventSource = es;
      es.onopen = () => {
        this.connected = true;
        reconnectDelay = 1000;
        this.stopPolling();
        void this.fetch();
      };
      es.addEventListener('task', (e: MessageEvent) => {
        try {
          this.upsert(JSON.parse(e.data) as Task);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('tasks', (e: MessageEvent) => {
        try {
          this.replace(JSON.parse(e.data) as Task[]);
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        this.connected = false;
        // 后端重启期间 Vite 代理会返回 500，此时浏览器不会自动重连（readyState 直接变 CLOSED），需手动重建。
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          if (eventSource === es) eventSource = null;
          this.scheduleReconnect();
        }
        this.startPolling();
      };
    },

    scheduleReconnect() {
      if (stopped || reconnectTimer) return;
      const delay = reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        this.openStream();
      }, delay);
    },

    startPolling() {
      if (stopped || pollTimer) return;
      void this.fetch();
      pollTimer = setInterval(() => void this.fetch(), 3000);
    },

    stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    disconnect() {
      stopped = true;
      this.connected = false;
      eventSource?.close();
      eventSource = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      this.stopPolling();
    },

    async add(payload: {
      url: string;
      formatId?: string;
      quality?: string;
      ext?: string;
      resolution?: string;
      saveDir?: string;
    }) {
      const t = await api.createTask(payload);
      this.upsert(t);
      return t;
    },
    async pause(id: string) {
      const t = await api.pauseTask(id);
      this.upsert(t);
      return t;
    },
    async resume(id: string) {
      const t = await api.resumeTask(id);
      this.upsert(t);
      return t;
    },
    async cancel(id: string) {
      const t = await api.cancelTask(id);
      this.upsert(t);
      return t;
    },
    async retry(id: string) {
      const t = await api.retryTask(id);
      this.upsert(t);
      return t;
    },
    async remove(id: string) {
      await api.removeTask(id);
      this.removeLocal(id);
    },
    async deleteFile(id: string) {
      const { task } = await api.deleteFile(id);
      this.upsert(task);
    },
  },
});
