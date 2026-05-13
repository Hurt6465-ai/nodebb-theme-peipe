'use strict';

const library = module.exports;

library.init = async function init() {
  // Official child theme entry point. Business APIs stay in plugins.
};

library.getThemeConfig = async function getThemeConfig(config) {
  config.peipeTheme = {
    profileCommentsDefault: true,
    ratingEnabled: true,
  };
  return config;
};

library.defineWidgetAreas = async function defineWidgetAreas(areas) {
  areas.push(
    { name: 'Peipe Profile Header', template: 'account/profile.tpl', location: 'peipe-profile-header' },
    { name: 'Peipe Profile Comments Top', template: 'account/profile.tpl', location: 'peipe-profile-comments-top' },
    { name: 'Peipe Profile Footer', template: 'account/profile.tpl', location: 'peipe-profile-footer' }
  );
  return areas;
};
