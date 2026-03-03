/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WS_BASE_URL } from "../config";

const InstancesStreamContext = createContext(null);

function getStartDate(task) {
  return task?.StartDateTime ?? task?.StartDate ?? null;
}

function getStartTimestamp(task) {
  return new Date(getStartDate(task) || 0).getTime();
}

function sortByStartDesc(items) {
  return [...items].sort(
    (a, b) =>
      new Date(getStartDate(b) || 0).getTime() -
      new Date(getStartDate(a) || 0).getTime()
  );
}

export function InstancesStreamProvider({ children }) {
  const taskMapRef = useRef(new Map());
  const instanceToConstructRef = useRef(new Map());
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const [tasks, setTasks] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (unmounted) return;
      clearReconnectTimer();

      reconnectAttemptRef.current += 1;
      const delayMs = Math.min(10000, 1000 * 2 ** (reconnectAttemptRef.current - 1));
      reconnectTimerRef.current = window.setTimeout(() => {
        if (unmounted) return;
        setLoading(true);
        connect();
      }, delayMs);
    };

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/instancias`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg?.tipo === "snapshot" && Array.isArray(msg.items)) {
            const map = new Map();
            const byInstance = new Map();

            for (const t of msg.items) {
              if (t?.ConstructID) map.set(t.ConstructID, t);
              if (t?.ConstructID && t?.InstanceID) {
                byInstance.set(String(t.InstanceID), t.ConstructID);
              }
            }

            taskMapRef.current = map;
            instanceToConstructRef.current = byInstance;
            setTasks(sortByStartDesc(Array.from(map.values())));
            setLoading(false);
            return;
          }

          let constructId = msg?.ConstructID;
          const instanceId = msg?.InstanceID ? String(msg.InstanceID) : "";

          if (!constructId && instanceId) {
            constructId = instanceToConstructRef.current.get(instanceId);
          }

          if (constructId && instanceId) {
            instanceToConstructRef.current.set(instanceId, constructId);
          }

          if (!constructId) {
            return;
          }

          const prev = taskMapRef.current.get(constructId) || null;
          const incomingStart = getStartTimestamp(msg);
          const prevStart = getStartTimestamp(prev);

          if (prev && incomingStart && prevStart && incomingStart < prevStart) {
            return;
          }

          const merged = { ...(prev || {}), ...msg };
          if (!merged.ConstructID) {
            merged.ConstructID = constructId;
          }

          taskMapRef.current.set(constructId, merged);
          if (merged?.InstanceID && merged?.ConstructID) {
            instanceToConstructRef.current.set(String(merged.InstanceID), merged.ConstructID);
          }

          setTasks(sortByStartDesc(Array.from(taskMapRef.current.values())));
          setLastUpdate({
            task: merged,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error("[Instances WS] mensaje invalido:", error);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        wsRef.current = null;
        setLoading(false);
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      unmounted = true;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      lastUpdate,
      loading,
    }),
    [tasks, lastUpdate, loading]
  );

  return (
    <InstancesStreamContext.Provider value={value}>
      {children}
    </InstancesStreamContext.Provider>
  );
}

export function useInstancesStream() {
  const context = useContext(InstancesStreamContext);
  if (!context) {
    console.warn("useInstancesStream fuera de InstancesStreamProvider; usando fallback vacio.");
    return {
      tasks: [],
      lastUpdate: null,
      loading: true,
    };
  }
  return context;
}
