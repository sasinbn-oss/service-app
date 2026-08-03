import { Alert, Platform } from "react-native";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

/**
 * Cross-platform replacement for Alert.alert.
 *
 * react-native-web does not implement Alert, so on the browser it silently does
 * nothing — errors would vanish and confirmations would never fire. On web this
 * falls back to the native dialogs instead.
 *
 * A dialog with a cancel-style button maps to window.confirm: OK runs the
 * non-cancel action, Cancel runs the cancel one. Anything else is a plain
 * window.alert followed by the first button's action, matching how a
 * single-button Alert behaves on a device.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = [title, message].filter(Boolean).join("\n\n");
  const list = buttons ?? [];
  const cancel = list.find((b) => b.style === "cancel");
  const confirm = list.find((b) => b.style !== "cancel");

  if (cancel && confirm) {
    // eslint-disable-next-line no-alert
    if (window.confirm(body)) confirm.onPress?.();
    else cancel.onPress?.();
    return;
  }

  // eslint-disable-next-line no-alert
  window.alert(body);
  list[0]?.onPress?.();
}
