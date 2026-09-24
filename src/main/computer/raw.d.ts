/** Source files bundled as text (the computer-use helper's C#). */
declare module '*.cs?raw' {
  const text: string;
  export default text;
}
