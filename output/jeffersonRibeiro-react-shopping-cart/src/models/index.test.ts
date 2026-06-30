import {
  IProduct,
  ICartProduct,
  ICartTotal,
  IGetProductsResponse,
} from '../models/index';

describe('IProduct interface conformance', () => {
  const validProduct: IProduct = {
    id: 1,
    sku: 1001,
    title: 'Test Shirt',
    description: 'A test description',
    availableSizes: ['S', 'M', 'L'],
    style: 'casual',
    price: 29.99,
    installments: 3,
    currencyId: 'USD',
    currencyFormat: '$',
    isFreeShipping: true,
  };

  it('should have all required fields with correct types', () => {
    expect(typeof validProduct.id).toBe('number');
    expect(typeof validProduct.sku).toBe('number');
    expect(typeof validProduct.title).toBe('string');
    expect(typeof validProduct.description).toBe('string');
    expect(Array.isArray(validProduct.availableSizes)).toBe(true);
    expect(typeof validProduct.style).toBe('string');
    expect(typeof validProduct.price).toBe('number');
    expect(typeof validProduct.installments).toBe('number');
    expect(typeof validProduct.currencyId).toBe('string');
    expect(typeof validProduct.currencyFormat).toBe('string');
    expect(typeof validProduct.isFreeShipping).toBe('boolean');
  });

  it('should allow isFreeShipping to be false', () => {
    const product: IProduct = { ...validProduct, isFreeShipping: false };
    expect(product.isFreeShipping).toBe(false);
  });

  it('should allow empty availableSizes array', () => {
    const product: IProduct = { ...validProduct, availableSizes: [] };
    expect(product.availableSizes).toHaveLength(0);
  });

  it('should allow price to be 0', () => {
    const product: IProduct = { ...validProduct, price: 0 };
    expect(product.price).toBe(0);
  });

  it('should allow installments to be 0', () => {
    const product: IProduct = { ...validProduct, installments: 0 };
    expect(product.installments).toBe(0);
  });

  it('should allow multiple sizes in availableSizes', () => {
    const product: IProduct = {
      ...validProduct,
      availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    };
    expect(product.availableSizes).toHaveLength(6);
    expect(product.availableSizes).toContain('XS');
    expect(product.availableSizes).toContain('XXL');
  });

  it('should handle large numeric ids', () => {
    const product: IProduct = { ...validProduct, id: 999999, sku: 888888 };
    expect(product.id).toBe(999999);
    expect(product.sku).toBe(888888);
  });
});

describe('ICartProduct interface conformance', () => {
  const validCartProduct: ICartProduct = {
    id: 2,
    sku: 1002,
    title: 'Cart Shirt',
    description: 'Cart description',
    availableSizes: ['M'],
    style: 'sport',
    price: 49.99,
    installments: 6,
    currencyId: 'EUR',
    currencyFormat: '€',
    isFreeShipping: false,
    quantity: 2,
  };

  it('should extend IProduct with a quantity field', () => {
    expect(typeof validCartProduct.quantity).toBe('number');
    expect(typeof validCartProduct.id).toBe('number');
    expect(typeof validCartProduct.price).toBe('number');
  });

  it('should allow quantity of 1', () => {
    const cartProduct: ICartProduct = { ...validCartProduct, quantity: 1 };
    expect(cartProduct.quantity).toBe(1);
  });

  it('should allow quantity of 0', () => {
    const cartProduct: ICartProduct = { ...validCartProduct, quantity: 0 };
    expect(cartProduct.quantity).toBe(0);
  });

  it('should carry all IProduct fields plus quantity', () => {
    const keys = Object.keys(validCartProduct);
    expect(keys).toContain('id');
    expect(keys).toContain('sku');
    expect(keys).toContain('title');
    expect(keys).toContain('description');
    expect(keys).toContain('availableSizes');
    expect(keys).toContain('style');
    expect(keys).toContain('price');
    expect(keys).toContain('installments');
    expect(keys).toContain('currencyId');
    expect(keys).toContain('currencyFormat');
    expect(keys).toContain('isFreeShipping');
    expect(keys).toContain('quantity');
  });
});

describe('ICartTotal interface conformance', () => {
  const validCartTotal: ICartTotal = {
    productQuantity: 3,
    installments: 2,
    totalPrice: 89.97,
    currencyId: 'USD',
    currencyFormat: '$',
  };

  it('should have all required fields with correct types', () => {
    expect(typeof validCartTotal.productQuantity).toBe('number');
    expect(typeof validCartTotal.installments).toBe('number');
    expect(typeof validCartTotal.totalPrice).toBe('number');
    expect(typeof validCartTotal.currencyId).toBe('string');
    expect(typeof validCartTotal.currencyFormat).toBe('string');
  });

  it('should allow productQuantity of 0', () => {
    const total: ICartTotal = { ...validCartTotal, productQuantity: 0 };
    expect(total.productQuantity).toBe(0);
  });

  it('should allow totalPrice of 0', () => {
    const total: ICartTotal = { ...validCartTotal, totalPrice: 0 };
    expect(total.totalPrice).toBe(0);
  });

  it('should allow fractional totalPrice', () => {
    const total: ICartTotal = { ...validCartTotal, totalPrice: 10.5 };
    expect(total.totalPrice).toBeCloseTo(10.5);
  });

  it('should allow installments of 0', () => {
    const total: ICartTotal = { ...validCartTotal, installments: 0 };
    expect(total.installments).toBe(0);
  });
});

describe('IGetProductsResponse interface conformance', () => {
  const validProduct: IProduct = {
    id: 1,
    sku: 1001,
    title: 'Product',
    description: 'Desc',
    availableSizes: ['S'],
    style: 'casual',
    price: 10,
    installments: 1,
    currencyId: 'USD',
    currencyFormat: '$',
    isFreeShipping: true,
  };

  it('should have data.products as an array of IProduct', () => {
    const response: IGetProductsResponse = {
      data: {
        products: [validProduct],
      },
    };
    expect(Array.isArray(response.data.products)).toBe(true);
    expect(response.data.products[0].id).toBe(1);
  });

  it('should allow empty products array', () => {
    const response: IGetProductsResponse = {
      data: {
        products: [],
      },
    };
    expect(response.data.products).toHaveLength(0);
  });

  it('should allow multiple products', () => {
    const response: IGetProductsResponse = {
      data: {
        products: [
          validProduct,
          { ...validProduct, id: 2, sku: 1002, title: 'Product 2' },
        ],
      },
    };
    expect(response.data.products).toHaveLength(2);
    expect(response.data.products[1].id).toBe(2);
  });
});