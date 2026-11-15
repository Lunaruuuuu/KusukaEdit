import type { Metadata } from "next";
import LoginPage from "@/components/LoginPage";

export const metadata: Metadata = {
  title: "Masuk · Canvas Design Editor",
};

export default function Login() {
  return <LoginPage />;
}
