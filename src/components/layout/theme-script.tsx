import { themeStorageKey } from "@/config/site";

/** Applies the saved theme before first paint so light mode never flashes dark. */
export function ThemeScript() {
  const code = `(function(){try{if(localStorage.getItem(${JSON.stringify(themeStorageKey)})==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
