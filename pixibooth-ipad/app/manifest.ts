import type { MetadataRoute } from "next";

/** Lets staff "Add to Home Screen" on the iPad so the booth opens without browser bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PIXIBOOTH",
    short_name: "PIXIBOOTH",
    start_url: "/",
    display: "fullscreen",
    orientation: "any",
    background_color: "#0A2D69",
    theme_color: "#0A2D69",
  };
}
