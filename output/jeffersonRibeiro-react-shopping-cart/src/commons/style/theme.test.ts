import { theme, StyleClosetTheme } from '../../commons/style/theme';

describe('theme object structure', () => {
  it('should export a theme object', () => {
    expect(theme).toBeDefined();
    expect(typeof theme).toBe('object');
  });

  it('should have a colors property', () => {
    expect(theme.colors).toBeDefined();
    expect(typeof theme.colors).toBe('object');
  });

  it('should have a breakpoints property', () => {
    expect(theme.breakpoints).toBeDefined();
    expect(typeof theme.breakpoints).toBe('object');
  });
});

describe('theme.colors', () => {
  it('should have primary color', () => {
    expect(theme.colors.primary).toBeDefined();
    expect(typeof theme.colors.primary).toBe('string');
  });

  it('should have the correct primary color value', () => {
    expect(theme.colors.primary).toBe('#1b1a20');
  });

  it('should have secondary color', () => {
    expect(theme.colors.secondary).toBeDefined();
    expect(typeof theme.colors.secondary).toBe('string');
  });

  it('should have the correct secondary color value', () => {
    expect(theme.colors.secondary).toBe('#eabf00');
  });

  it('should have exactly the expected color keys', () => {
    const colorKeys = Object.keys(theme.colors);
    expect(colorKeys).toContain('primary');
    expect(colorKeys).toContain('secondary');
    expect(colorKeys).toHaveLength(2);
  });

  it('should have colors as valid hex strings', () => {
    const hexPattern = /^#[0-9a-fA-F]{3,6}$/;
    Object.values(theme.colors).forEach((color) => {
      expect(color).toMatch(hexPattern);
    });
  });
});

describe('theme.breakpoints', () => {
  it('should have mobile breakpoint', () => {
    expect(theme.breakpoints.mobile).toBeDefined();
    expect(typeof theme.breakpoints.mobile).toBe('string');
  });

  it('should have the correct mobile breakpoint value', () => {
    expect(theme.breakpoints.mobile).toBe('480px');
  });

  it('should have tablet breakpoint', () => {
    expect(theme.breakpoints.tablet).toBeDefined();
    expect(typeof theme.breakpoints.tablet).toBe('string');
  });

  it('should have the correct tablet breakpoint value', () => {
    expect(theme.breakpoints.tablet).toBe('768px');
  });

  it('should have desktop breakpoint', () => {
    expect(theme.breakpoints.desktop).toBeDefined();
    expect(typeof theme.breakpoints.desktop).toBe('string');
  });

  it('should have the correct desktop breakpoint value', () => {
    expect(theme.breakpoints.desktop).toBe('1025px');
  });

  it('should have exactly the expected breakpoint keys', () => {
    const breakpointKeys = Object.keys(theme.breakpoints);
    expect(breakpointKeys).toContain('mobile');
    expect(breakpointKeys).toContain('tablet');
    expect(breakpointKeys).toContain('desktop');
    expect(breakpointKeys).toHaveLength(3);
  });

  it('should have breakpoints as px strings', () => {
    const pxPattern = /^\d+px$/;
    Object.values(theme.breakpoints).forEach((bp) => {
      expect(bp).toMatch(pxPattern);
    });
  });

  it('should have breakpoints in ascending order (mobile < tablet < desktop)', () => {
    const mobile = parseInt(theme.breakpoints.mobile, 10);
    const tablet = parseInt(theme.breakpoints.tablet, 10);
    const desktop = parseInt(theme.breakpoints.desktop, 10);
    expect(mobile).toBeLessThan(tablet);
    expect(tablet).toBeLessThan(desktop);
  });
});

describe('StyleClosetTheme interface conformance', () => {
  it('theme should conform to StyleClosetTheme', () => {
    const typedTheme: StyleClosetTheme = theme;
    expect(typedTheme).toBe(theme);
  });

  it('should allow creating a custom theme conforming to StyleClosetTheme', () => {
    const customTheme: StyleClosetTheme = {
      colors: {
        primary: '#ffffff',
        secondary: '#000000',
      },
      breakpoints: {
        mobile: '320px',
        tablet: '640px',
        desktop: '1024px',
      },
    };
    expect(customTheme.colors.primary).toBe('#ffffff');
    expect(customTheme.breakpoints.desktop).toBe('1024px');
  });
});

describe('theme immutability and reference', () => {
  it('should return the same object reference on multiple imports', async () => {
    const { theme: theme2 } = await import('../../commons/style/theme');
    expect(theme).toBe(theme2);
  });

  it('should not be null or undefined', () => {
    expect(theme).not.toBeNull();
    expect(theme).not.toBeUndefined();
  });

  it('colors object should not be null or undefined', () => {
    expect(theme.colors).not.toBeNull();
    expect(theme.colors).not.toBeUndefined();
  });

  it('breakpoints object should not be null or undefined', () => {
    expect(theme.breakpoints).not.toBeNull();
    expect(theme.breakpoints).not.toBeUndefined();
  });
});