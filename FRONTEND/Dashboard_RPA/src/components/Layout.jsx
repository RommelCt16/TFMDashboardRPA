import Sidebar from "./Sidebar";

function Layout({ children }) {
  return (
    <>
      <Sidebar />
      <section id="content">
        {children}
      </section>
    </>
  );
}

export default Layout;
