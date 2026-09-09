import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LaunchpadForm } from "@/pages/LaunchpadForm";

// A later form is a new route here plus a new module in server/.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LaunchpadForm />} />
        <Route path="/launchpad" element={<LaunchpadForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
