import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Budget } from "./pages/Budget";
import { Spending } from "./pages/Spending";
import { Investments } from "./pages/Investments";
import { Accounts } from "./pages/Accounts";
import { Settings } from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="spending" element={<Spending />} />
          <Route path="budget" element={<Budget />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="investments" element={<Investments />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
