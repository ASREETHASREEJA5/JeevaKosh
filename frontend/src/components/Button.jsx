import React from "react";
import Icon from "./Icon.jsx";

export default function Button({ children, variant = "primary", type = "button", icon, onClick, disabled }) {
  return (
    <button className={`btn ${variant}`} type={type} onClick={onClick} disabled={disabled}>
      {icon && <Icon icon={icon} />}
      {children}
    </button>
  );
}
