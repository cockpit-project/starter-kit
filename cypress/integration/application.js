// Use this for skipping the login page, i. e. all tests which do not test the login page itself
const visit_opts = { auth: { username: 'admin', password: 'foobar' } };

describe('Application', () => {
    beforeEach('start VM', function () {
        cy.task('startVM').then(url => Cypress.config('baseUrl', url));

        // Programmatically enable the "Reuse my password for privileged tasks" option
        cy.server({
            onAnyRequest: function (route, proxy) {
                proxy.xhr.setRequestHeader('X-Authorize',  'password');
            }
        });
    });

    afterEach('stop VM', function() {
        cy.task('stopVM');
    });

    it('basic functionality', function () {
        // cypress doesn't handle frames, so go to specific frame
        cy.visit('/cockpit/@localhost/starter-kit/index.html', visit_opts)
        // verify expected heading
        cy.get('.container-fluid h2').should('contain', 'Starter Kit');
        // verify expected host name
        cy.task('runVM', 'cat /etc/hostname').then(out => {
            cy.get('.container-fluid p').should('contain', 'Running on ' + out.trim());
        });
    });

    it('test with German translations', function() {
        cy.visit('/', visit_opts);

        // change language in menu
        cy.get('#content-user-name').click();
        cy.get('.display-language-menu a').click();
        cy.get('#display-language select').select('de-de');

        // HACK: language switching in Chrome not working in current session (Cockpit issue #8160)
        cy.on('uncaught:exception', (err, runnable) => {
            cy.log("Uncaught exception:", err);
            return false;
        });

        // menu label (from manifest) should be translated
        cy.get('#display-language-select-button').click();
        cy.get("#host-apps a[href='/starter-kit']").should('contain', 'Bausatz');

        // page label (from js) should be translated
        cy.visit('/cockpit/@localhost/starter-kit/index.html');
        cy.get('.container-fluid p').should('contain', 'Läuft auf');
    });

})
