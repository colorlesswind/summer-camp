// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
import AuthCard from '@/components/AuthCard.vue';
import BrandHeader from '@/components/BrandHeader.vue';

describe('AuthCard', () => {
  it('renders neither title nor description when none is provided', () => {
    const wrapper = mount(AuthCard, { slots: { default: '<p class="body">hi</p>' } });

    expect(wrapper.find('.auth-card__title').exists()).toBe(false);
    expect(wrapper.find('.auth-card__description').exists()).toBe(false);
    expect(wrapper.find('.body').text()).toBe('hi');
  });

  it('renders the title and the description above the slot', () => {
    const wrapper = mount(AuthCard, {
      props: { title: 'Login', description: 'Sign in to continue' },
      slots: { default: '<p class="body">form</p>' },
    });

    expect(wrapper.find('.auth-card__title').text()).toBe('Login');
    expect(wrapper.find('.auth-card__description').text()).toBe('Sign in to continue');
    expect(wrapper.find('.body').exists()).toBe(true);
  });

  it('renders only the title when the description is empty', () => {
    const wrapper = mount(AuthCard, { props: { title: 'Login' } });

    expect(wrapper.find('.auth-card__title').text()).toBe('Login');
    expect(wrapper.find('.auth-card__description').exists()).toBe(false);
  });
});

describe('BrandHeader', () => {
  function mountHeader() {
    return mount(BrandHeader, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
  }

  it('links the university logo to the site root', () => {
    const wrapper = mountHeader();
    const link = wrapper.findComponent(RouterLinkStub);
    const image = wrapper.find('img');

    expect(link.props('to')).toBe('/');
    expect(image.attributes('alt')).toContain('Hong Kong University of Science and Technology');
    expect(image.attributes('src')).toContain('logo.png');
    expect(link.find('img').exists()).toBe(true);
  });

  it('shows the Function Hub unit name in both languages', () => {
    const wrapper = mountHeader();

    expect(wrapper.find('.brand-header__unit-cn').text()).toBe('功能枢纽');
    expect(wrapper.find('.brand-header__unit-en').text()).toBe('FUNCTION HUB');
  });

  it('does not render the actions area without an actions slot', () => {
    const wrapper = mountHeader();

    expect(wrapper.find('.brand-header__actions').exists()).toBe(false);
  });

  it('renders the actions slot content', () => {
    const wrapper = mount(BrandHeader, {
      global: { stubs: { RouterLink: RouterLinkStub } },
      slots: { actions: '<button class="logout">Log out</button>' },
    });

    expect(wrapper.find('.brand-header__actions .logout').text()).toBe('Log out');
  });
});
