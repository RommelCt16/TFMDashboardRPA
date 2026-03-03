import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import RunningTasksPage from "./pages/RunningTasksPage";
import GeneralDashboardPage from "./pages/GeneralDashboardPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import { InstancesStreamProvider } from "./context/InstancesStreamContext";

function App() {
  const location = useLocation();

  return (
    <InstancesStreamProvider>
      <Layout>
        <Routes location={location}>
          {/* clave basada en location.key para forzar remount al navegar,
              incluso si la ruta es la misma */}
          <Route
            path="/"
            element={<RunningTasksPage key={location.key} />}
          />
          <Route
            path="/general"
            element={<GeneralDashboardPage key={location.key} />}
          />
          <Route
            path="/detalle/:constructId/:instanceId"
            element={<TaskDetailPage key={location.key} />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </InstancesStreamProvider>
  );
}

export default App;
