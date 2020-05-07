# Keep the PF4 relevant rules in sync with https://github.com/cockpit-project/cockpit/blob/master/tools/patternfly.sed
s/src:url[(]"patternfly-icons-fake-path\/pficon[^}]*/src:url('fonts\/patternfly.woff')format('woff');/
s/@font-face[^}]*patternfly-fonts-fake-path[^}]*}//g
