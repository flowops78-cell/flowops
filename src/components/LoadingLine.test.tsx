import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingLine from './LoadingLine';
import '@testing-library/jest-dom';

describe('LoadingLine', () => {
  it('renders with default label', () => {
    render(<LoadingLine />);
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<LoadingLine label="Fetching Data" />);
    expect(screen.getByText(/Fetching Data/i)).toBeInTheDocument();
  });

  it('shows progress percentage when determinate', () => {
    render(<LoadingLine progress={45} />);
    expect(screen.getByText(/45%/i)).toBeInTheDocument();
  });

  it('bounds progress between 4 and 100', () => {
    render(<LoadingLine progress={200} />);
    expect(screen.getByText(/100%/i)).toBeInTheDocument();
    
    render(<LoadingLine progress={0} />);
    expect(screen.getByText(/4%/i)).toBeInTheDocument();
  });

  it('applies compact styles when requested', () => {
    const { container } = render(<LoadingLine compact />);
    const bar = container.querySelector('.h-1');
    expect(bar).toBeInTheDocument();
  });
});
