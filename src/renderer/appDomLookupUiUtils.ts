function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return element;
}

function qs<T extends Element>(sel: string): T {
  const element = document.querySelector<T>(sel);
  if (!element) {
    throw new Error(`Missing required DOM selector: ${sel}`);
  }
  return element;
}
