"use client";

/**
 * Reusable transition wrapper components.
 * Uses CSS classes from globals.css — transform + opacity only for 60fps.
 */

export function PageTransition({ children, className = '' }) {
  return (
    <div className={`page-transition ${className}`}>
      {children}
    </div>
  );
}

export function ModalOverlay({ children, onClick, className = '' }) {
  return (
    <div className={`modal-overlay ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function ModalContent({ children, className = '' }) {
  return (
    <div className={`modal-content ${className}`} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}

export function CardHover({ children, className = '', as: Tag = 'div', ...props }) {
  return (
    <Tag className={`card-hover ${className}`} {...props}>
      {children}
    </Tag>
  );
}

export function StaggerList({ children, className = '' }) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div key={child?.key ?? i} className="stagger-item" style={{ animationDelay: `${i * 0.05}s` }}>
              {child}
            </div>
          ))
        : children}
    </div>
  );
}

export function Skeleton({ className = '', width, height }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width: width || '100%', height: height || '1rem' }}
    />
  );
}

export function SkeletonLight({ className = '', width, height }) {
  return (
    <div
      className={`skeleton-light ${className}`}
      style={{ width: width || '100%', height: height || '1rem' }}
    />
  );
}
