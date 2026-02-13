// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import "boxicons/css/boxicons.min.css";

function Sidebar() {
  return (
    <section id="sidebar">
      <NavLink to="/" className="brand">
        <i className="bx bxs-bot icon" />
        <span>Dashboard RPA</span>
      </NavLink>

      <ul className="side-menu">
        <li>
          <NavLink to="/" end>
            <i className="bx bxs-dashboard icon" />
            <span>Tareas en Ejecución</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/general">
            <i className="bx bxs-bar-chart-alt-2 icon" />
            <span>Dashboard de Tareas</span>
          </NavLink>
        </li>
      </ul>
    </section>
  );
}

export default Sidebar;
