// Native Text and TextInput apply the OS accessibility scale themselves.
// Multiplying their font sizes here would apply that scale twice.
export function useSystemFontScale() { return 1; }
