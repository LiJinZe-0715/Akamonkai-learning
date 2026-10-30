import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({mode}) => ({
    base: mode === "production" ? "/Akamonkai-learning/" : "/",
    plugins: [react(), tailwindcss()],
    build: {target: "es2022"},
    server: {port: 4173},
}));
